import { randomUUID } from "node:crypto";
import {
  ApiError,
  apiError,
  apiUser,
  checkOrigin,
  jsonBody,
  rateLimit,
} from "@cloud/lib/auth";
import { encryptJson } from "@cloud/lib/crypto";
import {
  db,
  listDomainPersonsForUser,
  logActivity,
  logAudit,
  transaction,
} from "@cloud/lib/database";
import {
  TimewebApiError,
  timewebToken,
  updateTimewebPerson,
  type TimewebPersonInput,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

function textField(
  body: Record<string, unknown>,
  key: string,
  label: string,
  min = 2,
  max = 180,
): string {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (value.length < min || value.length > max) {
    throw new ApiError(400, `Проверьте поле «${label}».`);
  }
  return value;
}

function dateField(
  body: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = textField(body, key, label, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `Поле «${label}» должно быть в формате ГГГГ-ММ-ДД.`);
  }
  return value;
}

function maskPassport(series: string, number: string): string {
  const tail = number.slice(-4);
  return `${series.slice(0, 2)}** ••${tail}`;
}

function validatePersonBody(body: Record<string, unknown>): {
  payload: TimewebPersonInput;
  label: string;
  summary: string;
} {
  const type = body.type;
  if (type !== "person" && type !== "org" && type !== "ip") {
    throw new ApiError(400, "Выберите тип администратора: физлицо, ИП или организация.");
  }

  const isResident = body.isResident !== false;
  const countryCode = isResident
    ? null
    : textField(body, "countryCode", "Код страны", 2, 3).toUpperCase();
  const postcode = textField(body, "postcode", "Почтовый индекс", 4, 12);
  const mailingAddress = textField(
    body,
    "mailingAddress",
    "Почтовый адрес",
    6,
    250,
  );
  const phone = textField(body, "phone", "Телефон", 6, 25);
  const email = textField(body, "email", "Email", 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Укажите корректный email администратора.");
  }

  if (type === "org") {
    const name = textField(body, "name", "Название организации", 2, 180);
    const contactName = textField(body, "contactName", "Контактное лицо", 2, 140);
    const inn = textField(body, "inn", "ИНН", 10, 12);
    if (!/^\d{10,12}$/.test(inn)) {
      throw new ApiError(400, "ИНН организации должен содержать 10–12 цифр.");
    }
    const kpp =
      typeof body.kpp === "string" && body.kpp.trim()
        ? textField(body, "kpp", "КПП", 9, 9)
        : undefined;
    const legalAddress = textField(
      body,
      "legalAddress",
      "Юридический адрес",
      6,
      250,
    );
    return {
      payload: {
        type: "org",
        name,
        is_resident: isResident,
        contact_name: contactName,
        inn,
        ...(kpp ? { kpp } : {}),
        legal_address: legalAddress,
        postcode,
        mailing_address: mailingAddress,
        phone,
        email,
        ...(countryCode ? { country_code: countryCode } : {}),
      },
      label: name,
      summary: `Юрлицо · ИНН ${inn} · ${email}`,
    };
  }

  const name = textField(body, "name", "ФИО", 4, 140);
  const birthdate = dateField(body, "birthdate", "Дата рождения");
  const passportSeries = textField(
    body,
    "passportSeries",
    "Серия паспорта",
    2,
    12,
  );
  const passportNumber = textField(
    body,
    "passportNumber",
    "Номер паспорта",
    4,
    16,
  );
  const passportDate = dateField(
    body,
    "passportDate",
    "Дата выдачи паспорта",
  );
  const passportPlace = textField(
    body,
    "passportPlace",
    "Кем выдан паспорт",
    3,
    220,
  );

  if (type === "ip") {
    const inn = textField(body, "inn", "ИНН ИП", 12, 12);
    if (!/^\d{12}$/.test(inn)) {
      throw new ApiError(400, "ИНН ИП должен содержать 12 цифр.");
    }
    return {
      payload: {
        type: "ip",
        name,
        is_resident: isResident,
        birthdate,
        passport_date: passportDate,
        passport_number: passportNumber,
        passport_place: passportPlace,
        passport_series: passportSeries,
        inn,
        postcode,
        mailing_address: mailingAddress,
        phone,
        email,
        ...(countryCode ? { country_code: countryCode } : {}),
      },
      label: name,
      summary: `ИП · ИНН ${inn} · паспорт ${maskPassport(passportSeries, passportNumber)}`,
    };
  }

  return {
    payload: {
      type: "person",
      name,
      is_resident: isResident,
      birthdate,
      passport_date: passportDate,
      passport_number: passportNumber,
      passport_place: passportPlace,
      passport_series: passportSeries,
      postcode,
      mailing_address: mailingAddress,
      phone,
      email,
      ...(countryCode ? { country_code: countryCode } : {}),
    },
    label: name,
    summary: `Физлицо · паспорт ${maskPassport(passportSeries, passportNumber)} · ${email}`,
  };
}

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(
      { persons: user.demo ? [] : listDomainPersonsForUser(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(
        400,
        "В демокабинете нельзя сохранять персональные данные администратора домена.",
      );
    }
    rateLimit(`persons:${user.id}`, 20);
    const body = await jsonBody(request);
    const { payload, label, summary } = validatePersonBody(body);
    const { ciphertext, keyVersion } = encryptJson(payload);

    const id = randomUUID();
    const now = Date.now();
    transaction(() => {
      db()
        .prepare(
          "INSERT INTO domain_persons (id,user_id,type,label,summary,encrypted_payload,key_version,tw_person_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NULL,?,?)",
        )
        .run(id, user.id, payload.type, label, summary, ciphertext, keyVersion, now, now);
      logActivity(user.id, `Добавлен профиль администратора домена: ${label}`);
      logAudit(user.id, "domain_person.create", "domain_person", id, {
        type: payload.type,
      });
    });

    return Response.json({
      person: {
        id,
        type: payload.type,
        label,
        summary,
        twPersonId: null,
        createdAt: now,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "В демокабинете профили недоступны.");
    }
    rateLimit(`persons-upd:${user.id}`, 20);
    const body = await jsonBody(request);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new ApiError(400, "Укажите ID профиля.");

    const existing = db()
      .prepare(
        "SELECT id,type,label,summary,encrypted_payload,tw_person_id FROM domain_persons WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as
      | {
          id: string;
          type: string;
          label: string;
          summary: string;
          encrypted_payload: string;
          tw_person_id: number | null;
        }
      | undefined;
    if (!existing) throw new ApiError(404, "Профиль не найден.");

    const postcode = textField(body, "postcode", "Почтовый индекс", 4, 12);
    const mailingAddress = textField(
      body,
      "mailingAddress",
      "Почтовый адрес",
      6,
      250,
    );
    const phone = textField(body, "phone", "Телефон", 6, 25);
    const email = textField(body, "email", "Email", 5, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, "Укажите корректный email администратора.");
    }

    const { decryptJson } = await import("@cloud/lib/crypto");
    const currentPayload = decryptJson<TimewebPersonInput>(
      existing.encrypted_payload,
    );
    const updatedPayload: TimewebPersonInput = {
      ...currentPayload,
      postcode,
      mailing_address: mailingAddress,
      phone,
      email,
    };

    if (existing.tw_person_id && timewebToken()) {
      try {
        await updateTimewebPerson(existing.tw_person_id, {
          address: mailingAddress,
          email,
          phone,
          postcode,
        });
      } catch (error) {
        if (error instanceof TimewebApiError) {
          throw new ApiError(
            502,
            "Не удалось обновить контактные данные в Timeweb Cloud.",
          );
        }
        throw error;
      }
    }

    const { ciphertext, keyVersion } = encryptJson(updatedPayload);
    const now = Date.now();
    transaction(() => {
      db()
        .prepare(
          "UPDATE domain_persons SET encrypted_payload=?,key_version=?,updated_at=? WHERE id=? AND user_id=?",
        )
        .run(ciphertext, keyVersion, now, id, user.id);
      logActivity(
        user.id,
        `Обновлён профиль администратора домена: ${existing.label}`,
      );
      logAudit(user.id, "domain_person.update", "domain_person", id);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser();
    if (user.demo) {
      throw new ApiError(400, "В демокабинете профили недоступны.");
    }
    rateLimit(`persons-del:${user.id}`, 20);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() || "";
    if (!id) throw new ApiError(400, "Укажите ID профиля.");

    const deleted = transaction(() => {
      const result = db()
        .prepare("DELETE FROM domain_persons WHERE id=? AND user_id=?")
        .run(id, user.id);
      if (result.changes > 0) {
        logActivity(user.id, "Удалён профиль администратора домена");
        logAudit(user.id, "domain_person.delete", "domain_person", id);
      }
      return result.changes;
    });

    if (!deleted) throw new ApiError(404, "Профиль не найден.");
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

