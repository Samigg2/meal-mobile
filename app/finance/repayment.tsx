import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { RepaymentInput } from "@/lib/data";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, makeRef, numberOf, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { Field, Loading } from "@/components/ui";

/** A repayment waits with what it repays, for the Sync screen and to open it again. */
type QueuedRepayment = RepaymentInput & { _loan?: string };

/**
 * Money paid back on a loan, with its receipt. It waits for someone else to
 * verify it on the web before it counts; the server refuses more than is
 * still owed on what was paid out.
 */
export default function RecordRepayment() {
  const { loan, loanLabel } = useLocalSearchParams<{ loan?: string; loanLabel?: string }>();
  const queued = useQueuedPayload<QueuedRepayment>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <RepaymentForm
      initial={initial}
      loanId={initial?.application_id ?? loan ?? ""}
      loanLabel={initial?._loan ?? loanLabel ?? ""}
      queuedId={queued.queuedId}
    />
  );
}

function RepaymentForm({
  initial,
  loanId,
  loanLabel,
  queuedId,
}: {
  initial: QueuedRepayment | null;
  loanId: string;
  loanLabel: string;
  queuedId?: string;
}) {
  const scroll = useRef<ScrollView>(null);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [channel, setChannel] = useState(initial?.channel ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const money = numberOf(amount);
  // The web's rules and words (loan-detail/transaction-form.tsx), checked while filling and on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!loanId) found.form = "Open this from the participant's loan.";
    if (amount.trim() === "") found.amount = "Enter the amount";
    else if (money === undefined || !(money > 0)) found.amount = "The amount must be more than 0";
    else if ((amount.split(".")[1] ?? "").length > 2) found.amount = "At most 2 decimal places";
    if (!date) found.date = "Date is required";
    else if (date > todayISO()) found.date = "The date cannot be in the future";
    if (!channel.trim()) found.channel = "Payment method is required";
    if (!reference.trim()) found.reference = "Reference is required";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedRepayment = {
      application_id: loanId,
      amount: money!,
      date,
      channel: channel.trim(),
      reference: reference.trim(),
      notes: notes.trim() || undefined,
      client_ref: clientRef,
      _loan: loanLabel || undefined,
    };
    setSaving(true);
    try {
      setDone(
        await saveOrQueue({
          kind: "loan_repayment",
          label: `Repayment — ${loanLabel || "loan"}, ${money!.toLocaleString("en")}`,
          payload,
          queuedId,
        }),
      );
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not save the repayment"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="repayment" />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save the repayment" saving={saving} onSave={handleSave}>
      <FormCard title={loanLabel || "Repayment"} hint="It counts once someone else verifies it on the web.">
        <Field label="Amount" required value={amount} onChangeText={setAmount} onBlur={() => live.touch("amount")} keyboardType="decimal-pad" error={errors.amount} />
        <DateField label="Date" required value={date} onChange={(v) => { setDate(v); live.touch("date"); }} max={todayISO()} error={errors.date} />
        <Field label="Payment method" required value={channel} onChangeText={setChannel} onBlur={() => live.touch("channel")} hint="Cash, bank, mobile money…" error={errors.channel} />
        <Field label="Reference" required value={reference} onChangeText={setReference} onBlur={() => live.touch("reference")} error={errors.reference} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
      </FormCard>
    </FormScreen>
  );
}
