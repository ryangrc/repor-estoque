'use client';
import { type ReactNode, useState } from 'react';
import {
  Package,
  AlertTriangle,
  CircleCheck,
  CircleAlert,
  ArrowRight,
  LoaderCircle,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { type Status, statusLabels } from '@/lib/domain';
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Package size={25} />
      </span>
      <span>
        repor<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export function Badge({ status }: { status: Status }) {
  const Icon =
    status === 'critical'
      ? CircleAlert
      : status === 'warning'
        ? AlertTriangle
        : CircleCheck;
  return (
    <span className={`status ${status}`}>
      <Icon size={14} />
      {statusLabels[status]}
    </span>
  );
}
export function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
      items={options}
    >
      <SelectTrigger className="pick" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="modal">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Confirm({
  title,
  description,
  run,
  close,
}: {
  title: string;
  description: string;
  run: () => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <AlertDialog open onOpenChange={(v) => !v && !busy && close()}>
      <AlertDialogContent className="confirm">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await run();
                close();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Aguarde…' : 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Package size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Submit({
  busy,
  label = 'Salvar alterações',
}: {
  busy: boolean;
  label?: string;
}) {
  return (
    <button type="submit" disabled={busy} className="btn primary">
      {busy ? <LoaderCircle className="spin" size={17} /> : null}
      {busy ? 'Salvando…' : label}
      {!busy && <ArrowRight size={17} />}
    </button>
  );
}
export const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);
export const date = (v: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: v.length > 10 ? 'short' : undefined,
  }).format(new Date(v.length === 10 ? `${v}T12:00:00` : v));
