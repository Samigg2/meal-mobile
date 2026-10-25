import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LOAN_PRODUCTS, listProviders, type LoanInput, type LoanProduct } from "@/lib/data";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, makeRef, numberOf, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { useLookupOptions } from "@/lib/reference";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { ChoiceRow, ErrorText, Field, Loading, Select } from "@/components/ui";

/** A loan waits with the borrower's name, for the Sync screen and to open it again. */
type QueuedLoan = LoanInput & { _borrower?: string };

/**
 * A participant's loan application, recorded where it is made. It starts as
 * "applied": approving it and paying it out are done on the web by someone
 * else (four-eyes), never from the phone. The server checks the rest: the
 * lender offers this kind of loan, is active, a SACCO lends only to members,
 * and the borrower has no other open loan.
 */
export default function RecordLoan() {
  const { participant, participantName } = useLocalSearchParams<{ participant?: string; participantName?: string }>();
  const queued = useQueuedPayload<QueuedLoan>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <LoanForm
      initial={initial}
      borrower={initial?.participant_id ?? participant ?? ""}
      borrowerName={initial?._borrower ?? participantName ?? ""}
      queuedId={queued.queuedId}
    />
  );
}

function LoanForm({
  initial,
  borrower,
  borrowerName,
  queuedId,
}: {
  initial: QueuedLoan | null;
  borrower: string;
  borrowerName: string;
  queuedId?: string;
}) {
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const providers = useQuery({ queryKey: ["finance-providers"], queryFn: listProviders });
  const providerTypes = useLookupOptions("financial_service_providers.provider_type");
  const [providerType, setProviderType] = useState("");
  const [product, setProduct] = useState<LoanProduct | undefined>(initial?.product_type);
  const [provider, setProvider] = useState(initial?.provider_id ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount_requested) : "");
  const [term, setTerm] = useState(initial?.term_months !== undefined ? String(initial.term_months) : "");
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [applied, setApplied] = useState(initial?.application_date ?? todayISO());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  // Active providers of the chosen type; the loan kinds are what that provider offers (as the web).
  const all = providers.data ?? [];
  // A waiting loan reopens on its provider's type.
  const typeOf = providerType || all.find((p) => p.id === provider)?.provider_type || "";
  const lenders = all
    .filter((p) => p.status === "active" && p.provider_type === typeOf)
    .map((p) => ({ label: p.name, value: p.id }));
  const offered = all.find((p) => p.id === provider)?.products_offered;
  const kinds = LOAN_PRODUCTS.filter((k) => !offered || offered.includes(k.value));

  const money = numberOf(amount);
  const months = numberOf(term);
  // The web's rules and words (finance.loans.new.tsx), checked while filling and on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!borrower) found.form = "Open this from the participant who borrows.";
    if (!typeOf) found.provider_type = "Choose the type of provider";
    if (!provider) found.provider_id = "Choose the provider";
    if (!product) found.product_type = "Choose business loan or personal loan";
    if (amount.trim() === "") found.amount_requested = "Amount requested is required";
    else if (money === undefined || Number.isNaN(money) || money <= 0) found.amount_requested = "Amount requested must be more than 0";
    else if (money > 100_000_000) found.amount_requested = "Amount requested must be at most 100,000,000";
    else if ((amount.split(".")[1] ?? "").length > 2) found.amount_requested = "Amount requested takes at most 2 decimal places";
    if (months !== undefined && (!Number.isInteger(months) || months < 1 || months > 600)) {
      found.term_months = "Term must be a whole number of months between 1 and 600";
    }
    if (!applied) found.application_date = "Application date is required";
    else if (applied > todayISO()) found.application_date = "Application date cannot be in the future";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedLoan = {
      provider_id: provider,
      participant_id: borrower,
      product_type: product!,
      amount_requested: money!,
      term_months: months,
      purpose: purpose.trim() || undefined,
      application_date: applied,
      notes: notes.trim() || undefined,
      client_ref: clientRef,
      _borrower: borrowerName || undefined,
    };
    setSaving(true);
    try {
      const result = await saveOrQueue({
        kind: "loan",
        label: `Loan — ${borrowerName || "participant"}, ${money!.toLocaleString("en")}`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["participant-detail", borrower] });
      setDone(result);
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not save the loan"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="loan" />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save the loan" saving={saving} onSave={handleSave}>
      <FormCard
        title={borrowerName ? `Loan for ${borrowerName}` : "Loan"}
        hint="Recorded as applied. Approval and payout are done on the web."
      >
        <Select
          label="Provider type"
          required
          value={typeOf || undefined}
          options={providerTypes}
          onChange={(v) => {
            setProviderType(v);
            setProvider("");
            setProduct(undefined);
            live.touch("provider_type");
          }}
          placeholder="Select the type"
          error={errors.provider_type}
        />
        <Select
          label="Financial service provider"
          required
          value={provider || undefined}
          options={lenders}
          onChange={(v) => {
            setProvider(v);
            const next = all.find((p) => p.id === v);
            if (product && next && !next.products_offered.includes(product)) setProduct(undefined);
            live.touch("provider_id");
          }}
          placeholder={typeOf ? "Select the provider" : "Choose the type first"}
          disabled={!typeOf}
          error={errors.provider_id}
        />
        {providers.isError && !providers.data ? (
          <ErrorText>
            The providers are not on this phone yet: connect once, or use Download for offline on the Sync screen.
          </ErrorText>
        ) : null}
        <ChoiceRow
          label="Product"
          required
          value={product}
          options={kinds}
          onChange={(v) => {
            setProduct(v);
            live.touch("product_type");
          }}
          error={errors.product_type}
        />
        <Field
          label="Amount requested"
          required
          value={amount}
          onChangeText={setAmount}
          onBlur={() => live.touch("amount_requested")}
          keyboardType="decimal-pad"
          error={errors.amount_requested}
        />
        <Field
          label="Term (months)"
          value={term}
          onChangeText={setTerm}
          onBlur={() => live.touch("term_months")}
          keyboardType="number-pad"
          error={errors.term_months}
        />
        <DateField
          label="Application date"
          required
          value={applied}
          onChange={(v) => {
            setApplied(v);
            live.touch("application_date");
          }}
          max={todayISO()}
          error={errors.application_date}
        />
        <Field label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={1000} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </FormCard>
    </FormScreen>
  );
}
