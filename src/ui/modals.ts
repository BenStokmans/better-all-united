import type { ModalConfig, ModalRef, ImportReport } from "../types";
import { makeEl, copyToClipboard } from "../utils/dom";
import { t } from "../i18n";
import { createButton } from "./components";

export const showOverlayModal = ({
  title,
  bodyNodes,
  footerNodes,
  width = 720,
}: ModalConfig): ModalRef => {
  const overlay = makeEl(
    "div",
    {},
    {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.45)",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }
  );

  const modal = makeEl(
    "div",
    {},
    {
      width: `min(${width}px, 95vw)`,
      maxHeight: "90vh",
      overflow: "auto",
      background: "#fff",
      borderRadius: "10px",
      boxShadow:
        "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
      padding: "16px",
      fontFamily:
        "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial",
      color: "#111827",
    }
  );

  const header = makeEl(
    "div",
    {},
    { display: "flex", alignItems: "center", justifyContent: "space-between" },
    [
      makeEl(
        "h2",
        { text: title || "" },
        { margin: "0", fontSize: "18px", fontWeight: "600" }
      ),
      createButton({
        id: "",
        text: "✕",
        onClick: () => overlay.remove(),
        styles: {
          background: "#fff",
          color: "#111827",
          border: "1px solid #e5e7eb",
          borderRadius: "999px",
          width: "32px",
          height: "32px",
          padding: "0",
          fontSize: "16px",
        },
      }),
    ]
  );

  const body = makeEl("div", {}, { marginTop: "12px" }, bodyNodes || []);
  const footer = makeEl(
    "div",
    {},
    { marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" },
    footerNodes || []
  );

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  return { overlay, modal };
};

export const showProgressModal = (
  total: number,
  onCancel?: () => void
): {
  update: (params: {
    step?: string;
    name?: string;
    completed?: number;
    total?: number;
    outcome?: string;
  }) => void;
  finish: () => void;
  overlay: HTMLElement;
} => {
  let totalCount = Number.isFinite(total) && total > 0 ? total : 0;
  const safeTotal = totalCount > 0 ? totalCount : 1;

  const progressFill = makeEl(
    "div",
    {},
    {
      height: "100%",
      width: "0%",
      background: "#0ea5a5",
      borderRadius: "6px",
      transition: "width 0.2s ease",
    }
  );

  const progressTrack = makeEl(
    "div",
    {},
    {
      width: "100%",
      height: "12px",
      background: "#e5e7eb",
      borderRadius: "6px",
      overflow: "hidden",
    },
    [progressFill]
  );

  const progressLabel = makeEl(
    "div",
    { text: totalCount > 0 ? `0 / ${totalCount}` : "0 / ?" },
    { marginTop: "6px", fontWeight: "600", color: "#0f172a" }
  );

  const currentName = makeEl(
    "div",
    { text: "" },
    { marginTop: "10px", color: "#334155" }
  );

  const statusEl = makeEl(
    "div",
    { text: t("preparing") },
    { marginTop: "4px", color: "#6b7280", fontSize: "13px" }
  );

  const overlayRef = showOverlayModal({
    title: t("importing_members"),
    bodyNodes: [progressTrack, progressLabel, currentName, statusEl],
    footerNodes: [
      createButton({
        id: "",
        text: t("cancel"),
        onClick: () => {
          statusEl.textContent = "Aborting...";
          onCancel?.();
        },
        styles: { background: "#ef4444", border: "1px solid #ef4444" },
      }),
    ],
    width: 520,
  });

  const update = ({
    step,
    name,
    completed = 0,
    total: nextTotal,
    outcome,
  }: {
    step?: string;
    name?: string;
    completed?: number;
    total?: number;
    outcome?: string;
  } = {}) => {
    if (typeof nextTotal === "number" && nextTotal >= 0) {
      totalCount = nextTotal;
    }

    const denom = totalCount > 0 ? totalCount : safeTotal;
    const safeCompleted = Math.max(0, completed);
    const pct =
      denom > 0 ? Math.min(100, Math.round((safeCompleted / denom) * 100)) : 0;

    progressFill.style.width = `${pct}%`;
    progressLabel.textContent =
      totalCount > 0
        ? `${Math.min(safeCompleted, totalCount)} / ${totalCount}`
        : `${safeCompleted}`;

    if (step === "start" && name) {
      currentName.textContent = t("processing_prefix", { name });
      statusEl.textContent = t("resolving_contact");
    }

    if (step === "complete") {
      const messages: Record<string, string> = {
        found: t("message_found"),
        notFound: t("message_notFound"),
        ambiguous: t("message_ambiguous"),
        error: t("message_error"),
      };

      if (name) currentName.textContent = t("completed_prefix", { name });
      if (outcome && messages[outcome])
        statusEl.textContent = messages[outcome];
    }
  };

  const finish = () => {
    overlayRef.overlay.remove();
  };

  return { update, finish, overlay: overlayRef.overlay };
};

const buildReportText = ({
  successes,
  notFound,
  ambiguous,
}: ImportReport): string => {
  const lines: string[] = [];

  lines.push(`${t("imported")} ${successes.length}`);
  if (successes.length) {
    lines.push(
      ...successes.map(
        (s) => `  - ${s.name} -> contactId ${s.contactId} (${s.label})`
      )
    );
  }

  lines.push(`${t("ambiguous")} ${ambiguous.length}`);
  if (ambiguous.length) {
    lines.push(
      ...ambiguous.map(
        (a) =>
          `  - ${a.name}: ${a.reason}\n    Candidates: ${
            (a.candidates || []).join(", ") || "(none)"
          }`
      )
    );
  }

  lines.push(`${t("not_found")} ${notFound.length}`);
  if (notFound.length) {
    lines.push(
      ...notFound.map((n) => `  - ${n.name}: ${n.reason || "(no reason)"}`)
    );
  }

  return lines.join("\n");
};

export const showReportModal = (report: ImportReport): void => {
  const { successes, notFound, ambiguous } = report;

  const summary = makeEl(
    "div",
    {},
    {
      display: "grid",
      gridTemplateColumns: "repeat(3,minmax(0,1fr))",
      gap: "8px",
      marginBottom: "8px",
    },
    [
      makeEl(
        "div",
        { text: `${t("imported")}\n${successes.length}` },
        {
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: "8px",
          padding: "8px",
          whiteSpace: "pre-line",
          textAlign: "center",
          fontWeight: "600",
          color: "#065f46",
        }
      ),
      makeEl(
        "div",
        { text: `${t("ambiguous")}\n${ambiguous.length}` },
        {
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: "8px",
          padding: "8px",
          whiteSpace: "pre-line",
          textAlign: "center",
          fontWeight: "600",
          color: "#92400e",
        }
      ),
      makeEl(
        "div",
        { text: `${t("not_found")}\n${notFound.length}` },
        {
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
          padding: "8px",
          whiteSpace: "pre-line",
          textAlign: "center",
          fontWeight: "600",
          color: "#991b1b",
        }
      ),
    ]
  );

  const section = <T>(
    title: string,
    items: T[],
    renderItem: (item: T) => HTMLElement
  ): HTMLElement => {
    const container = makeEl("div", {}, { marginTop: "8px" }, []);

    container.appendChild(
      makeEl(
        "div",
        { text: title },
        { fontWeight: "600", marginBottom: "4px", color: "#374151" }
      )
    );

    if (!items.length) {
      container.appendChild(
        makeEl("div", { text: t("none") }, { color: "#6b7280" })
      );
      return container;
    }

    const list = makeEl("div", {}, { display: "grid", gap: "6px" }, []);
    items.forEach((it) => list.appendChild(renderItem(it)));
    container.appendChild(list);

    return container;
  };

  const successItem = (s: ImportReport["successes"][0]) =>
    makeEl(
      "div",
      {},
      {
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        padding: "6px 8px",
        background: "#f9fafb",
        fontSize: "13px",
      },
      [
        makeEl("div", { text: s.name }, { fontWeight: "600" }),
        makeEl(
          "div",
          { text: `contactId: ${s.contactId}  •  ${s.label || ""}` },
          { color: "#6b7280", marginTop: "2px" }
        ),
      ]
    );

  const ambItem = (a: ImportReport["ambiguous"][0]) =>
    makeEl(
      "div",
      {},
      {
        border: "1px solid #fde68a",
        borderRadius: "6px",
        padding: "6px 8px",
        background: "#fffbeb",
        fontSize: "13px",
      },
      [
        makeEl("div", { text: a.name }, { fontWeight: "600" }),
        makeEl(
          "div",
          { text: a.reason || "" },
          { color: "#92400e", marginTop: "2px" }
        ),
        makeEl(
          "div",
          {
            text: (a.candidates || []).length
              ? `Candidates: ${a.candidates.join(", ")}`
              : "Candidates: —",
          },
          { color: "#92400e", marginTop: "2px" }
        ),
      ]
    );

  const nfItem = (n: ImportReport["notFound"][0]) =>
    makeEl(
      "div",
      {},
      {
        border: "1px solid #fecaca",
        borderRadius: "6px",
        padding: "6px 8px",
        background: "#fef2f2",
        fontSize: "13px",
      },
      [
        makeEl("div", { text: n.name }, { fontWeight: "600" }),
        makeEl(
          "div",
          { text: n.reason || "" },
          { color: "#991b1b", marginTop: "2px" }
        ),
      ]
    );

  const { overlay } = showOverlayModal({
    title: "Import report",
    bodyNodes: [
      summary,
      section(t("imported"), successes, successItem),
      section(t("ambiguous"), ambiguous, ambItem),
      section(t("not_found"), notFound, nfItem),
    ],
    footerNodes: [
      createButton({
        id: "",
        text: t("copy_summary"),
        onClick: async (e) => {
          const ok = await copyToClipboard(buildReportText(report));
          (e.target as HTMLButtonElement).textContent = ok
            ? t("copied")
            : t("copy_failed");
          setTimeout(
            () =>
              ((e.target as HTMLButtonElement).textContent = t("copy_summary")),
            1200
          );
        },
        styles: { background: "#6366f1", border: "1px solid #6366f1" },
      }),
      createButton({
        id: "",
        text: t("close"),
        onClick: () => overlay.remove(),
        styles: { background: "#6b7280", border: "1px solid #6b7280" },
      }),
    ],
  });
};
