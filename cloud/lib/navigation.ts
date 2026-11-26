import { plans } from "./catalog";
export function authDestination(
  query: Record<string, string | string[] | undefined>,
) {
  if (
    typeof query.plan === "string" &&
    plans.some((plan) => plan.id === query.plan)
  )
    return `/dashboard/servers?create=${query.plan}`;
  if (
    typeof query.next === "string" &&
    /^\/dashboard(?:\/(?:servers|domains|infra|orders|billing|settings|support))?(?:\?create=(?:start|project|business|scale))?$/.test(
      query.next,
    )
  )
    return query.next;
  return "/dashboard";
}
