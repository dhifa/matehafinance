import { Client } from "../types";

export interface ResolvedClientDetails {
  company: string;
  pic: string;
  phone: string;
  displayName: string;
}

/**
 * Resolves client details robustly, ensuring company and PIC
 * are correctly identified even if legacy records were inverted.
 */
export function resolveClientDetails(client: Client): ResolvedClientDetails {
  const comp = (client.company || "").trim();
  const picVal = (client.pic || "").trim();
  const nameVal = (client.name || "").trim();
  const phone = (client.phone || "").trim();

  // 1. If explicit pic is set:
  if (picVal) {
    const companyName = comp || nameVal;
    return {
      company: companyName,
      pic: picVal,
      phone,
      displayName: companyName && picVal && companyName !== picVal
        ? `${companyName} (PIC: ${picVal})`
        : (companyName || picVal),
    };
  }

  // 2. If both company and name exist, but no explicit pic field (legacy data):
  if (comp && nameVal) {
    // Check if one of them looks like a person title (Ibu, Bpk, etc.) or company indicator (PT, CV, etc.)
    const isCompanyPersonLike = /^(ibu|bpk|bapak|pak|mas|mba|mbak|dr\.|drg\.|sdr|sdri|mr|mrs|ms)\b/i.test(comp);
    const isNameCompanyLike = /\b(pt|cv|ud|tbk|kemen|dinas|eo|organizer|agency|corp|group|yayasan|sekolah|universitas|studio|hotel|resort|villa|foundation)\b/i.test(nameVal);

    if (isCompanyPersonLike || isNameCompanyLike) {
      // The user previously entered the PIC into company and the Company into name
      return {
        company: nameVal,
        pic: comp,
        phone,
        displayName: `${nameVal} (PIC: ${comp})`,
      };
    }

    // Default legacy mapping: in ClientManagement form, input 1 was "Nama Klien / PIC" (name)
    // and input 2 was "Nama Perusahaan" (company).
    return {
      company: comp,
      pic: nameVal,
      phone,
      displayName: `${comp} (PIC: ${nameVal})`,
    };
  }

  // 3. Only one of company or name is present:
  const soleName = comp || nameVal;
  return {
    company: soleName,
    pic: "",
    phone,
    displayName: soleName,
  };
}
