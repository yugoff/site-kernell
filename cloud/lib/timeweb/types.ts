export type TimewebErrorPayload = {
  status_code?: number;
  error_code?: string;
  message?: string | string[];
  response_id?: string;
};

export type TimewebListMeta = {
  total: number;
};

export type TimewebLocation = {
  location: string;
  location_code: string;
  availability_zones: string[];
};

export type TimewebTldPeriod = {
  period: string;
  price: number;
};

export type TimewebTld = {
  id: number;
  name: string;
  price: number;
  prolong_price: number;
  transfer: number;
  whois_privacy_price?: number;
  is_published: boolean;
  is_registered?: boolean;
  is_whois_privacy_enabled?: boolean;
  is_whois_privacy_default_enabled?: boolean;
  early_renew_period?: number | null;
  grace_period?: number;
  registrar?: string;
  allowed_buy_periods?: TimewebTldPeriod[];
};

export type TimewebServerPreset = {
  id: number;
  location: string;
  price: number;
  cpu: number;
  cpu_frequency: string;
  ram: number;
  disk: number;
  disk_type: "ssd" | "nvme" | "hdd" | string;
  bandwidth: number;
  description: string;
  description_short: string;
  is_allowed_local_network?: boolean;
  tags?: string[];
};

export type TimewebServerOs = {
  id: number;
  family: string;
  name: string;
  version: string | null;
  version_codename?: string | null;
  description?: string;
  requirements?: Record<string, unknown>;
};

export type TimewebServerSoftware = {
  id: number;
  name: string;
  os_ids?: number[];
  description?: string;
};

export type TimewebServerConfigurator = {
  id: number;
  location: string;
  disk_type: string;
  cpu_frequency: string;
  is_allowed_local_network?: boolean;
  requirements: Record<string, unknown>;
};

export type TimewebDatabaseType = {
  name: string;
  version: string;
  type: string;
  is_available_replication?: boolean;
  is_deprecated?: boolean;
};

export type TimewebDatabasePreset = {
  id: number;
  description: string;
  description_short: string;
  cpu: number;
  cpu_frequency?: string;
  ram: number;
  disk: number;
  type: string;
  price: number;
  location: string;
  tags?: string[];
};

export type TimewebDatabaseConfigurator = {
  id: number;
  disk_type: string;
  cpu_frequency: string;
  location: string;
  is_allowed_local_network?: boolean;
  requirements: Record<string, unknown>;
  prices: Record<string, unknown>;
  tags?: string[];
};

export type TimewebStoragePreset = {
  id: number;
  description: string;
  description_short: string;
  disk: number;
  price: number;
  location: string;
  storage_class?: "cold" | "hot" | string;
  tags?: string[];
};

export type TimewebK8sPreset = {
  id: number;
  description: string;
  description_short: string;
  price: number;
  cpu: number;
  ram: number;
  disk: number;
  network?: number;
  type: "master" | "worker" | string;
  limit?: number;
};

export type TimewebDedicatedPreset = {
  id: number;
  description: string;
  is_ipmi_enabled?: boolean;
  is_pre_installed?: boolean;
  cpu: Record<string, unknown>;
  disk: Record<string, unknown>;
  memory: Record<string, unknown>;
  price: number;
  location: string;
};

export type TimewebBalancerPreset = {
  id: number;
  description: string;
  description_short: string;
  bandwidth: number;
  replica_count: number;
  request_per_second: number;
  price: number;
  location: string;
};

export type TimewebAppPreset = {
  id: number;
  description?: string;
  description_short?: string;
  price: number;
  cpu?: number;
  ram?: number;
  disk?: number;
  [key: string]: unknown;
};

export type TimewebAppsPresets = {
  backend_presets: TimewebAppPreset[];
  frontend_presets: TimewebAppPreset[];
};

export type TimewebRegistryPreset = {
  id: number;
  description: string;
  description_short: string;
  price: number;
  cpu: number;
  ram: number;
  disk: number;
  network: number;
};

export type TimewebCdnPreset = {
  id: number;
  service_name?: string;
  description?: string;
  description_short?: string;
  cost: number;
  traffic_rate_cost?: number;
  request_rate_cost?: number;
};

export type TimewebRouterPreset = {
  id: number;
  node_count: number;
  cpu: number;
  cpu_frequency: string;
  ram: number;
  bandwidth: number;
  cost: number;
  location: string;
};

export type TimewebNetworkDrivePreset = {
  id: number;
  cost_per_gb: number;
  min: number;
  max: number;
  step: number;
  type: string;
  read?: number;
  write?: number;
};

export type TimewebAccountFinances = {
  balance: number;
  currency: string;
  discount_end_date_at: string | null;
  discount_percent: number;
  hourly_cost: number;
  hourly_fee: number;
  monthly_cost: number;
  monthly_fee: number;
  total_paid: number;
  hours_left: number | null;
  autopay_card_info: string | null;
};

export type TimewebAccountStatus = {
  login: string;
  is_blocked: boolean;
  is_permanent_blocked: boolean;
  is_send_bill_letters: boolean;
  company_info: { id: number; name: string };
  last_password_changed_at: string;
  ym_client_id: string | null;
};

export type TimewebPersonInput =
  | {
      type: "person";
      name: string;
      is_resident: boolean;
      birthdate: string;
      passport_date: string;
      passport_number: string;
      passport_place: string;
      passport_series: string;
      postcode: string;
      mailing_address: string;
      phone: string;
      email: string;
      country_code?: string | null;
    }
  | {
      type: "org";
      name: string;
      is_resident: boolean;
      contact_name: string;
      inn: string;
      kpp?: string;
      legal_address: string;
      postcode: string;
      mailing_address: string;
      phone: string;
      email: string;
      country_code?: string | null;
    }
  | {
      type: "ip";
      name: string;
      is_resident: boolean;
      birthdate: string;
      passport_date: string;
      passport_number: string;
      passport_place: string;
      passport_series: string;
      inn: string;
      postcode: string;
      mailing_address: string;
      phone: string;
      email: string;
      country_code?: string | null;
    };

export type TimewebProject = {
  id: number;
  account_id: string;
  avatar_id: string;
  description: string;
  name: string;
  is_default: boolean;
};

export type TimewebPersonRecord = {
  id: number;
  type: "person" | "org" | "ip";
  name: string;
  name_eng?: string;
  email: string;
  phone: string;
  postcode: string;
  mailing_address: string;
  country_code?: string;
  is_resident: boolean;
  is_blank?: boolean;
  is_closed?: boolean;
};

export type TimewebDomainRequest = {
  id: number;
  fqdn: string;
  type: "request" | "prolong" | "transfer" | string;
  period: string;
  person_id: number | null;
  money_source: "use" | "bonus" | "invoice" | "free" | string | null;
  is_autoprolong_enabled: boolean;
  is_whois_privacy_enabled: boolean;
  message?: string | null;
  date?: string;
  error_code_transfer?: string | null;
};

export type TimewebDomainInfo = {
  id: number;
  fqdn: string;
  domain_status:
    | "awaiting_payment"
    | "expired"
    | "final_expired"
    | "free"
    | "no_paid"
    | "ns_based"
    | "paid"
    | "soon_expire"
    | "today_expired"
    | string;
  request_status:
    | "prolongation_fail"
    | "prolongation_request"
    | "registration_fail"
    | "registration_request"
    | "transfer_fail"
    | "transfer_request"
    | "awaiting_person"
    | string
    | null;
  expiration: string | null;
  paid_till: string | null;
  days_left: number | null;
  is_autoprolong_enabled: boolean;
  is_prolong_allowed: boolean;
  is_whois_privacy_enabled: boolean;
  linked_ip?: string | null;
  person_id?: number | null;
  provider?: string;
  subdomains?: Array<{ id: number; fqdn: string }>;
  tld_id?: number;
};

export type TimewebNameServerItem = {
  host: string;
  ips?: string[];
};

export type TimewebNameServersEntry = {
  is_delegation_allowed: boolean;
  task_status: "done" | "active" | "failed" | string;
  items: TimewebNameServerItem[];
};

export type TimewebDnsRecordType =
  | "A"
  | "AAAA"
  | "TXT"
  | "CNAME"
  | "MX"
  | "SRV"
  | "PTR"
  | "HTTPS"
  | "SVCB"
  | "CAA";

export type TimewebDnsRecord = {
  id: number;
  type: TimewebDnsRecordType;
  fqdn: string;
  ttl: number;
  data: {
    priority?: number;
    subdomain?: string;
    value?: string;
    host?: string;
    port?: number;
    service?: string;
    protocol?: string;
  };
};

export type TimewebDnsRecordInput =
  | { type: "A" | "AAAA" | "TXT" | "CNAME"; value: string; ttl?: number }
  | { type: "MX"; value: string; priority: number; ttl?: number }
  | {
      type: "SRV";
      service: string;
      protocol: string;
      priority: number;
      port: number;
      host: string;
      ttl?: number;
    };

export type TimewebSshKey = {
  id: number;
  name: string;
  body: string;
  created_at: string;
  is_default: boolean;
  used_by: Array<{ id: number; name: string }>;
};

export type TimewebServerDisk = {
  id: number;
  size: number;
  used: number;
  type: string;
  is_mounted: boolean;
  is_system: boolean;
  system_name: string;
  status: string;
};

export type TimewebServerIp = {
  type: "ipv4" | "ipv6";
  ip: string;
  ptr?: string | null;
  is_main: boolean;
};

export type TimewebServerNetwork = {
  id?: string;
  type: "public" | "local";
  nat_mode?: string;
  bandwidth?: number | null;
  ips: TimewebServerIp[] | null;
  is_ddos_guard?: boolean;
  is_image_mounted?: boolean;
  blocked_ports?: number[];
};

export type TimewebServer = {
  id: number;
  name: string;
  comment: string;
  created_at: string;
  os: { id: number; name: string; version: string | null };
  software: { id: number; name: string } | null;
  preset_id: number | null;
  configurator_id: number | null;
  location: string;
  boot_mode?: string;
  status: string;
  start_at?: string | null;
  is_ddos_guard: boolean;
  cpu: number;
  cpu_frequency?: string;
  ram: number;
  disks: TimewebServerDisk[];
  vnc_pass: string | null;
  root_pass: string | null;
  networks: TimewebServerNetwork[];
  image?: { id: string; name: string; is_custom: boolean } | null;
  availability_zone?: string | null;
};

export type TimewebCreateServerInput = {
  name: string;
  preset_id?: number;
  configuration?: {
    configurator_id: number;
    disk: number;
    cpu: number;
    ram: number;
    gpu?: number;
  };
  os_id?: number;
  image_id?: string;
  software_id?: number;
  bandwidth?: number;
  is_ddos_guard?: boolean;
  ssh_keys_ids?: number[];
  is_local_network?: boolean;
  availability_zone?: string;
  project_id?: number;
  hostname?: string;
  comment?: string;
  cloud_init?: string;
};

export type TimewebUpdateServerInput = {
  name?: string;
  comment?: string;
  os_id?: number;
  software_id?: number;
  preset_id?: number;
  bandwidth?: number;
};

export type TimewebServerAction =
  | "start"
  | "shutdown"
  | "hard_shutdown"
  | "reboot"
  | "hard_reboot"
  | "reset_password"
  | "install"
  | "remove"
  | "clone";

export type TimewebDatabaseCluster = {
  id: number;
  name: string;
  description?: string;
  location: string;
  type: string;
  port: number;
  status: string;
  preset_id: number | null;
  cpu: number;
  ram: number;
  disk: number;
  is_enabled_public_network?: boolean;
  availability_zone?: string;
  project_id?: number;
  networks?: Array<{
    type: string;
    ips?: Array<{ type: string; ip: string | null }>;
  }>;
};

export type TimewebDatabaseAdmin = {
  id: string;
  login: string;
  host?: string;
  description?: string;
};

export type TimewebDatabaseInstance = {
  id: string;
  name: string;
  description?: string;
};

export type TimewebStorageBucket = {
  id: number;
  name: string;
  description?: string;
  type: "private" | "public" | string;
  preset_id: number;
  status: string;
  location: string;
  hostname: string;
  access_key: string;
  secret_key: string;
  storage_class?: string;
  object_amount?: number;
  project_id?: number;
  website_config?: Record<string, unknown> | null;
  disk_stats?: { size?: number; used?: number };
};

export type TimewebK8sCluster = {
  id: number;
  name: string;
  description?: string;
  status: string;
  k8s_version: string;
  network_driver: string;
  ingress?: boolean;
  preset_id: number;
  cpu: number;
  ram: number;
  disk: number;
  availability_zone?: string;
  project_id?: number;
};

export type TimewebK8sNodeGroup = {
  id: number;
  name: string;
  preset_id: number;
  node_count: number;
  status?: string;
};

export type TimewebBalancer = {
  id: number;
  name: string;
  algo: string;
  proto: string;
  port: number;
  status: string;
  ip?: string | null;
  preset_id: number;
  project_id?: number;
  availability_zone?: string;
};

export type TimewebBalancerRule = {
  id: number;
  balancer_proto: string;
  balancer_port: number;
  server_proto: string;
  server_port: number;
};

export type TimewebFirewallGroup = {
  id: string;
  name: string;
  description?: string;
  policy?: string;
};

export type TimewebFirewallRule = {
  id: string;
  direction: "ingress" | "egress";
  protocol: "tcp" | "udp" | "icmp";
  port?: string | null;
  cidr: string;
  description?: string;
};

export type TimewebVpc = {
  id: string;
  name: string;
  subnet_v4: string;
  location: string;
  description?: string;
  availability_zone?: string;
};

export type TimewebFloatingIp = {
  id: string;
  ip: string;
  is_ddos_guard: boolean;
  availability_zone: string;
  resource_type: string | null;
  resource_id?: string | number | null;
  comment?: string;
  ptr?: string | null;
};

export type TimewebRouter = {
  id: string;
  name: string;
  comment?: string;
  status: string;
  zone?: string;
  preset_id: number;
  project_id?: number;
  ips?: Array<{ ip?: string; is_main?: boolean }>;
};

export type TimewebNetworkDrive = {
  id: number;
  name: string;
  comment?: string;
  size: number;
  status: string;
  preset_id: number;
  resource_type?: string | null;
  resource_id?: number | null;
};

export type TimewebCdnResource = {
  id: string;
  name: string;
  status: string;
  preset_id: number;
  delivery_domain?: string;
  origin_domain?: string;
  use_https?: boolean;
  project_id?: number;
};

export type TimewebMailbox = {
  fqdn: string;
  mailbox: string;
  comment?: string;
  usage_space?: number;
  owner_full_name?: string;
  is_webmail?: boolean;
};



