import { UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Contact, ContactRole } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorPanel } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { ApiError, api } from "@/lib/api";
import { qk, upsertInCache, useContacts } from "@/lib/queries";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function PayeesPage() {
  const contacts = useContacts();
  const list = contacts.data ?? [];
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Contacts and payees</h1>
          <p className="text-muted">Clients you invoice and contractors you pay. PaySasa matches names and nicknames like “my editor”.</p>
        </div>
        <section className="rounded-[var(--radius-card)] border border-border bg-surface shadow-1" aria-label="Contacts">
          {contacts.isLoading ? (
            <SkeletonRows rows={4} label="Loading contacts" />
          ) : contacts.isError ? (
            <ErrorPanel message={(contacts.error as Error).message} onRetry={() => contacts.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon={<Users aria-hidden className="size-6" />} title="No contacts yet">
              Add the people you bill or pay. You can also just type an email in a request to PaySasa, and it adds the contact for you.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((c) => (
                <ContactRow key={c.id} contact={c} />
              ))}
            </ul>
          )}
        </section>
      </div>
      <AddContactForm />
    </div>
  );
}

function ContactRow({ contact: c }: { contact: Contact }) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
        {c.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{c.name}</p>
        <p className="text-[13px] break-all text-muted">{c.email}</p>
        {c.aliases.length > 0 && <p className="text-[13px] text-muted">Also known as: {c.aliases.join(", ")}</p>}
      </div>
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", c.role === "contractor" ? "bg-info-soft text-info" : "bg-surface-2 text-muted")}>
        {c.role === "contractor" ? "Contractor (can be paid)" : "Client"}
      </span>
    </li>
  );
}

function AddContactForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ContactRole>("contractor");
  const [aliases, setAliases] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Enter a name.";
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address, e.g. sarah@example.com.";
    setErrors(next);
    if (next.name || next.email) return;
    setSaving(true);
    try {
      const { contact } = await api.createContact({
        name: name.trim(),
        email: email.trim(),
        role,
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 10),
      });
      upsertInCache(qc, qk.contacts, contact);
      void qc.invalidateQueries({ queryKey: qk.contacts });
      toast.success(`Added ${contact.name}`);
      setName("");
      setEmail("");
      setAliases("");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.isConflict) setErrors({ email: "A contact with this email already exists." });
      else setErrors({ form: apiErr?.friendly ?? "Couldn't add the contact. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex h-fit flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-1" aria-labelledby="add-h">
      <h2 id="add-h" className="flex items-center gap-2 font-semibold">
        <UserPlus aria-hidden className="size-4" /> Add a contact
      </h2>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={200} autoComplete="off" />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        hint="For contractors, use their PayPal email. Payouts go here."
        autoComplete="off"
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 font-medium">Role</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["contractor", "client"] as const).map((r) => (
            <label key={r} className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border p-2.5", role === r ? "border-accent bg-accent-soft" : "border-border-strong")}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-[var(--accent)]" />
              {r === "contractor" ? "Contractor" : "Client"}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="Nicknames (optional)" value={aliases} onChange={(e) => setAliases(e.target.value)} hint="Comma-separated, e.g. my editor" />
      {errors.form && (
        <p role="alert" className="text-[13px] text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" variant="primary" loading={saving}>
        {saving ? "Adding…" : "Add contact"}
      </Button>
    </form>
  );
}
