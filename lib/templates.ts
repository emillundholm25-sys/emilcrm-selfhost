import { Campaign, Contact, EmailDraft, EmailTemplate } from "./types";

// Outreach email templates with `{{merge}}` fields. A campaign holds one template;
// a contact gets a personalised draft rendered from it (see store.generateDraft).

/** The merge fields a template can use, in the order shown in the editor hint. */
export const MERGE_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "company",
  "title",
  "industry",
  "location",
  "campaign",
] as const;

/** Used when a campaign has no template of its own. */
export const DEFAULT_EMAIL_TEMPLATE: EmailTemplate = {
  subject: "Quick idea for {{company}}",
  body: `Hi {{firstName}},

I came across {{company}} and wanted to reach out. We help teams like yours turn cold outreach into booked meetings — without the manual busywork.

Worth 20 minutes next week to see if it's a fit?

Best,`,
};

interface TemplateVars {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  industry?: string;
  location?: string;
  campaign?: string;
}

// When a field is missing we substitute something that still reads naturally
// ("Hi there," rather than "Hi ,"); other fields just collapse to empty.
const FALLBACKS: Record<string, string> = { firstname: "there", fullname: "there" };

/** Replace `{{field}}` tokens in `text`. Unknown tokens are left visible on purpose. */
export function renderTemplate(text: string, v: TemplateVars): string {
  const map: Record<string, string> = {
    firstname: v.firstName ?? "",
    lastname: v.lastName ?? "",
    fullname: `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim(),
    company: v.company ?? "",
    title: v.title ?? "",
    industry: v.industry ?? "",
    location: v.location ?? "",
    campaign: v.campaign ?? "",
  };
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (!(key in map)) return whole;
    return map[key] || FALLBACKS[key] || "";
  });
}

/** Render a full draft (subject + body) for a contact from a campaign template. */
export function renderEmailDraft(
  template: EmailTemplate,
  contact: Contact,
  campaign?: Campaign
): Pick<EmailDraft, "subject" | "body"> {
  const vars: TemplateVars = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    title: contact.title,
    industry: contact.industry,
    location: contact.location,
    campaign: campaign?.name,
  };
  return {
    subject: renderTemplate(template.subject, vars),
    body: renderTemplate(template.body, vars),
  };
}
