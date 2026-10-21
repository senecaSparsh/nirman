import "@/components/iso/iso.css";
import "./site-pour.css";
import { IsoFigure, Plate } from "@/components/iso/react/draw";
import { SitePourArt } from "./art";
import { FIG_H, FIG_W, POUR_REST, readoutOf } from "./view";

/**
 * "Site pour" — an isometric figure for the public + empty-state surfaces.
 * A slab mid-pour on acrow props: the wet band creeps bay to bay while the
 * readout counts cement bags — progress you can watch, the same thing the
 * DPR reports in words.
 */
export function SitePourFigure({ className }: { className?: string }) {
  return (
    <div className={`iso site-pour ${className ?? ""}`} data-theme="light">
      <Plate
        fig="Fig 1"
        title="The pour, live"
        hint="The wet band advances on its own"
        readout={readoutOf(POUR_REST)}
        keys={[
          { mark: "lit", label: "Fresh concrete, this shift" },
          { mark: "edge", label: "Rebar — the skeleton Nirman counts" },
        ]}
        caption="A slab mid-pour: shuttering on acrow props, rebar mat on chairs, cement on the pallet, slump cone ready. The same bays your DPR marks done."
      >
        <IsoFigure width={FIG_W} height={FIG_H} label="Isometric site pour — a slab mid-pour on acrow props">
          <SitePourArt />
        </IsoFigure>
      </Plate>
    </div>
  );
}
