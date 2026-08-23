"use client";

import { Input, Label } from "@/components/ui/input";
import { PhotoUploader } from "@/components/ui/photo-uploader";

/**
 * ChequeFields — reusable sub-form for cheque details.
 *
 * Shown when payment mode is "CHEQUE". Captures cheque number, date, bank,
 * and an optional photo of the cheque (front side). The photo is uploaded
 * to /api/uploads and the URL is returned to the parent form.
 */
export interface ChequeFormState {
  chequeNo: string;
  chequeDate: string;
  chequeBank: string;
  chequePhotoUrl: string;
}

export const EMPTY_CHEQUE: ChequeFormState = {
  chequeNo: "",
  chequeDate: "",
  chequeBank: "",
  chequePhotoUrl: "",
};

export function ChequeFields({
  value,
  onChange,
}: {
  value: ChequeFormState;
  onChange: (v: ChequeFormState) => void;
}) {
  function set<K extends keyof ChequeFormState>(key: K, v: ChequeFormState[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-warning/40 bg-warning/5 p-3">
      <p className="text-caption font-medium text-warning">
        Cheque details — payment will be marked PENDING until cleared.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="chq-no">Cheque No.</Label>
          <Input
            id="chq-no"
            value={value.chequeNo}
            onChange={(e) => set("chequeNo", e.target.value)}
            placeholder="e.g. 000123"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chq-date">Cheque Date</Label>
          <Input
            id="chq-date"
            type="date"
            value={value.chequeDate}
            onChange={(e) => set("chequeDate", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="chq-bank">Bank</Label>
        <Input
          id="chq-bank"
          value={value.chequeBank}
          onChange={(e) => set("chequeBank", e.target.value)}
          placeholder="e.g. HDFC Bank, SBI, etc."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Cheque Photo (front)</Label>
        <PhotoUploader
          photos={value.chequePhotoUrl ? [{ url: value.chequePhotoUrl }] : []}
          onChange={(photos) => set("chequePhotoUrl", photos[0]?.url ?? "")}
          maxPhotos={1}
          label="Upload Cheque Photo"
        />
      </div>
    </div>
  );
}
