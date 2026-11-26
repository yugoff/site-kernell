import { ApiError, apiError, apiUser, rateLimit } from "@cloud/lib/auth";
import type { ServiceKind } from "@cloud/lib/catalog";
import { getVpsCatalogData } from "@cloud/lib/catalog-service";
import { db } from "@cloud/lib/database";
import { getInfraServiceDetails } from "@cloud/lib/infra-actions";
import { syncServiceFromProvider } from "@cloud/lib/provisioning";
import {
  fetchDomainDnsRecords,
  fetchDomainInfo,
  fetchDomainNameServers,
  fetchTimewebServerDisks,
  fetchTimewebServerIps,
  timewebToken,
} from "@cloud/lib/timeweb";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await apiUser();
    const { id } = await context.params;
    rateLimit(`service-details:${user.id}`, 60);

    const service = db()
      .prepare(
        "SELECT id,kind,name,status,details,address,renewal,auto_renew AS autoRenew,tw_resource_id AS twResourceId,metadata_json AS metadataJson FROM services WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as
      | {
          id: string;
          kind: ServiceKind;
          name: string;
          status: string;
          details: string;
          address: string;
          renewal: string;
          autoRenew: number;
          twResourceId: string | null;
          metadataJson: string | null;
        }
      | undefined;

    if (!service) throw new ApiError(404, "Услуга не найдена.");

    if (user.demo || !service.twResourceId || !timewebToken()) {
      return Response.json(
        {
          kind: service.kind,
          demo: user.demo,
          live: false,
          service: {
            id: service.id,
            kind: service.kind,
            name: service.name,
            status: service.status,
            details: service.details,
            address: service.address,
            renewal: service.renewal,
            autoRenew: Boolean(service.autoRenew),
          },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (service.kind === "vps") {
      const synced = await syncServiceFromProvider(service.id, user.id).catch(
        () => null,
      );
      const [disks, ips, vpsCatalog] = await Promise.all([
        fetchTimewebServerDisks(service.twResourceId).catch(() => null),
        fetchTimewebServerIps(service.twResourceId).catch(() => null),
        getVpsCatalogData(),
      ]);
      const credExists = Boolean(
        db()
          .prepare(
            "SELECT service_id FROM service_credentials WHERE service_id=? AND user_id=?",
          )
          .get(service.id, user.id),
      );
      const server = synced && "server" in synced ? synced.server : null;

      return Response.json(
        {
          kind: "vps",
          live: true,
          hasCredentials: credExists,
          status: synced?.status || service.status,
          address: synced?.address || service.address,
          server: server
            ? {
                id: server.id,
                cpu: server.cpu,
                ramMb: server.ram,
                location: server.location,
                os: server.os,
                isDdosGuard: server.is_ddos_guard,
                disks: disks ?? server.disks ?? [],
                networks: server.networks ?? [],
                ips: ips ?? null,
              }
            : null,
          operatingSystems: vpsCatalog.operatingSystems,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (service.kind !== "domain") {
      const details = await getInfraServiceDetails(user.id, {
        id: service.id,
        kind: service.kind,
        tw_resource_id: service.twResourceId,
      });
      return Response.json(details, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const fqdn = service.twResourceId;
    const [domainInfo, nsEntries, dnsRecords] = await Promise.all([
      fetchDomainInfo(fqdn).catch(() => null),
      fetchDomainNameServers(fqdn).catch(() => []),
      fetchDomainDnsRecords(fqdn).catch(() => []),
    ]);

    return Response.json(
      {
        kind: "domain",
        live: true,
        fqdn,
        domainInfo,
        nameservers: nsEntries.flatMap(
          (entry) => entry.items?.map((item) => item.host) ?? [],
        ),
        dnsRecords,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

