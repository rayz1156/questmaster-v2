// lib/mcp/certificate-tools.ts
//
// Bantuan alat MCP sijil (V2-015). Semua tulisan memanggil route
// /api/classes/[id]/certificates/** melalui callApi (lihat header
// lib/mcp/api.ts: jangan salin logik route ke dalam alat). Fail ini
// sengaja TIDAK mengimport session.ts atau db.ts supaya skrip ujian
// boleh mengujinya dengan mock tanpa pangkalan data.

import { callApi } from "./api";

/** Aset sijil yang disokong oleh tiket muat naik. */
export type CertAssetKind = "background" | "logo";

/** Templat sijil seperti dipulangkan route templates. */
export interface CertTemplate {
  id: string;
  title: string;
  criteria?: Record<string, unknown>;
  background_path?: string | null;
  logo_path?: string | null;
  layout?: Record<string, unknown> | null;
}

/**
 * Cipta templat sijil melalui route POST templates. Route yang
 * menormalkan layout, mengesahkan criteria dan menyemak pendidik kelas.
 */
export async function createCertificateTemplate(
  accessToken: string,
  args: {
    class_id?: string;
    title?: string;
    criteria?: unknown;
    layout?: unknown;
  }
): Promise<Record<string, unknown>> {
  if (!args.class_id) throw new Error("class_id diperlukan");
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) throw new Error("title diperlukan");
  if (!args.criteria || typeof args.criteria !== "object") {
    throw new Error("criteria diperlukan");
  }
  const res = await callApi<{ template?: Record<string, unknown> }>(
    accessToken,
    `/api/classes/${args.class_id}/certificates/templates`,
    {
      method: "POST",
      body: {
        title,
        criteria: args.criteria,
        ...(args.layout !== undefined && args.layout !== null ? { layout: args.layout } : {}),
      },
    }
  );
  return (res.template ?? res) as Record<string, unknown>;
}

/**
 * Kemas kini templat sijil melalui route PATCH templates: tajuk, kriteria,
 * layout, atau buang latar/logo (clear_background / clear_logo).
 * Hanya medan yang diberi dihantar.
 */
export async function updateCertificateTemplate(
  accessToken: string,
  args: {
    class_id?: string;
    template_id?: string;
    title?: string;
    criteria?: unknown;
    layout?: unknown;
    clear_background?: boolean;
    clear_logo?: boolean;
  }
): Promise<Record<string, unknown>> {
  if (!args.class_id) throw new Error("class_id diperlukan");
  if (!args.template_id) throw new Error("template_id diperlukan");

  const body: Record<string, unknown> = { template_id: args.template_id };
  if (typeof args.title === "string" && args.title.trim()) body.title = args.title.trim();
  if (args.criteria !== undefined) body.criteria = args.criteria;
  if (args.layout !== undefined) body.layout = args.layout;
  if (args.clear_background === true) body.clear_background = true;
  if (args.clear_logo === true) body.clear_logo = true;
  if (Object.keys(body).length === 1) throw new Error("Tiada medan untuk dikemas kini");

  const res = await callApi<{ template?: Record<string, unknown> }>(
    accessToken,
    `/api/classes/${args.class_id}/certificates/templates`,
    { method: "PATCH", body }
  );
  return (res.template ?? res) as Record<string, unknown>;
}

/** Hasil tiket muat naik aset, dengan arahan curl sedia guna. */
export type CertAssetTicket = {
  upload_url: string;
  token: string;
  path: string;
  expires_in: number;
  method: string;
  headers: Record<string, string>;
  curl: string;
};

/**
 * Dapatkan tiket muat naik latar/logo sijil (route asset-ticket).
 * Fail pada komputer pengguna dihantar TERUS ke storan dengan curl;
 * tiada bait melalui model. Mime mesti image/png atau image/jpeg dan
 * saiz maksimum 8 MB.
 */
export async function createCertificateAssetTicket(
  accessToken: string,
  classId: string,
  templateId: string,
  kind: CertAssetKind,
  mimeType: string,
  size: number
): Promise<CertAssetTicket> {
  const res = await callApi<{
    upload_url: string;
    token: string;
    path: string;
    expires_in: number;
    method: string;
    headers: Record<string, string>;
  }>(
    accessToken,
    `/api/classes/${classId}/certificates/templates/${templateId}/asset-ticket`,
    { method: "POST", body: { kind, mimeType, size } }
  );
  const curl =
    `curl -X PUT --upload-file <file> -H "Content-Type: ${mimeType}" "${res.upload_url}"`;
  return { ...res, curl };
}

/**
 * Sahkan muat naik aset (route asset-finalize): tandatangan bait disemak,
 * templat dikemas kini dan objek lama dipadam oleh route.
 */
export async function finalizeCertificateAsset(
  accessToken: string,
  classId: string,
  templateId: string,
  kind: CertAssetKind,
  path: string
): Promise<Record<string, unknown>> {
  const res = await callApi<{ template?: Record<string, unknown> }>(
    accessToken,
    `/api/classes/${classId}/certificates/templates/${templateId}/asset-finalize`,
    { method: "POST", body: { kind, path } }
  );
  return (res.template ?? res) as Record<string, unknown>;
}

/**
 * Pratonton PDF contoh templat (route sample dengan format=url):
 * pulangkan URL bertandatangan sah 10 minit. Tidak mencipta sijil sah.
 */
export async function previewCertificate(
  accessToken: string,
  classId: string,
  templateId: string,
  sampleName?: string
): Promise<{ url: string; expires_in: number }> {
  const res = await callApi<{ url: string; expires_in: number }>(
    accessToken,
    `/api/classes/${classId}/certificates/templates/${templateId}/sample?format=url`,
    {
      method: "POST",
      body:
        typeof sampleName === "string" && sampleName.trim()
          ? { name: sampleName.trim().slice(0, 120) }
          : {},
    }
  );
  return { url: res.url, expires_in: res.expires_in };
}

/** Satu baris senarai templat sijil untuk alat list_certificate_templates. */
export interface CertTemplateRingkas {
  id: string;
  title: string;
  criteria: Record<string, unknown> | null;
  layout: Record<string, unknown> | null;
  has_background: boolean;
  has_logo: boolean;
  updated_at: string | null;
}

/**
 * Senaraikan templat sijil kelas melalui route GET templates; laluan
 * objek diterjemah kepada boolean ada/tiada latar dan logo.
 */
export async function listCertificateTemplates(
  accessToken: string,
  classId: string
): Promise<{ templates: CertTemplateRingkas[] }> {
  const res = await callApi<{ templates?: CertTemplate[] }>(
    accessToken,
    `/api/classes/${classId}/certificates/templates`
  );
  const senarai = (res.templates ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    criteria: (t.criteria ?? null) as Record<string, unknown> | null,
    layout: (t.layout ?? null) as Record<string, unknown> | null,
    has_background: !!t.background_path,
    has_logo: !!t.logo_path,
    updated_at: (t as { updated_at?: string | null }).updated_at ?? null,
  }));
  return { templates: senarai };
}
