import * as XLSX from "xlsx";

export const exportTableToExcel = (): void => {
  const table = document.querySelector("table.subform-table.initialized");
  if (!table) {
    console.warn("Table not found for export");
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws_data: any[][] = [];

  // Parse Header
  const thead = table.querySelector("thead");
  if (thead) {
    const rows = Array.from(thead.querySelectorAll("tr"));
    rows.forEach((row) => {
      const rowData: string[] = [];
      const cells = Array.from(row.querySelectorAll("td, th"));
      cells.forEach((cell) => {
        const label = cell.querySelector(".text-label");
        if (label) {
            if (label.querySelector(".ion-trash-a")) {
                rowData.push("Delete");
            } else {
                rowData.push(label.textContent?.trim() || "");
            }
        } else {
            rowData.push(cell.textContent?.trim() || "");
        }
      });
      ws_data.push(rowData);
    });
  }

  // Parse Body
  const tbody = table.querySelector("tbody");
  if (tbody) {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    rows.forEach((row) => {
      const rowData: string[] = [];
      const cells = Array.from(row.querySelectorAll("td"));
      cells.forEach((cell) => {
        const inputs = Array.from(cell.querySelectorAll("input"));
        const visibleInput = inputs.find(i => i.type !== "hidden" && i.type !== "checkbox" && i.style.display !== "none");
        
        const checkbox = inputs.find(i => i.type === "checkbox");
        const select = cell.querySelector("select");
        const textSpan = cell.querySelector(".text");
        const customSelect = cell.querySelector(".custom-select--disabled");

        if (visibleInput) {
            rowData.push(visibleInput.value);
        } else if (checkbox) {
             rowData.push(checkbox.checked ? "Yes" : "No");
        } else if (select) {
             if (select.selectedIndex >= 0) {
                 rowData.push(select.options[select.selectedIndex].text);
             } else {
                 rowData.push(select.value);
             }
        } else if (customSelect) {
            rowData.push(customSelect.textContent?.trim() || "");
        } else if (textSpan) {
            rowData.push(textSpan.textContent?.trim() || "");
        } else {
            rowData.push(cell.textContent?.trim() || "");
        }
      });
      ws_data.push(rowData);
    });
  }

  // Filter out empty columns and the "Delete" column.
  // Also: if the header exists for a column but that column has no body values, exclude it.
  if (ws_data.length > 0) {
    const numCols = ws_data[0].length;
    const colsToKeep: number[] = [];

    // Ensure column to the right of 'Relatie' has header 'Naam' if empty
    const headerRow = ws_data[0].map((v) => (v == null ? "" : String(v).trim()));
    const relatieIndex = headerRow.findIndex((h) => h.toLowerCase() === "relatie");
    if (relatieIndex >= 0) {
      const nameIndex = relatieIndex + 1;
      if (nameIndex < numCols) {
        if (!headerRow[nameIndex]) {
          // set header in the ws_data so it'll appear in export
          ws_data[0][nameIndex] = "Naam";
        }
      }
    }

    for (let colIndex = 0; colIndex < numCols; colIndex++) {
      let isDelete = false;
      // If header is the special Delete marker, exclude
      const headerVal = ws_data[0][colIndex];
      if (headerVal === "Delete"  || headerVal === "Verbergvragen") {
        isDelete = true;
      }

      // Determine if column has any non-empty body cell (exclude header row)
      let hasBodyValue = false;
      for (let rowIndex = 1; rowIndex < ws_data.length; rowIndex++) {
        const cellValue = ws_data[rowIndex][colIndex];
        if (cellValue != null && String(cellValue).trim() !== "") {
          hasBodyValue = true;
          break;
        }
      }

      // If there's at least one body value OR the header exists and also there are body rows
      // we keep the column. We intentionally exclude columns that only have a header and no body values.
      if (!isDelete && hasBodyValue) {
        colsToKeep.push(colIndex);
      }
    }

    // If no columns to keep found (unlikely), fall back to keeping all except Delete
    if (colsToKeep.length === 0) {
      for (let colIndex = 0; colIndex < numCols; colIndex++) {
        if (ws_data[0][colIndex] !== "Delete") colsToKeep.push(colIndex);
      }
    }

    // Create new data with only kept columns
    const filtered_ws_data = ws_data.map((row) =>
      colsToKeep.map((i) => row[i])
    );

    // Helper to format names into "<firstname> <optional inbetween> <lastname>"
    const formatName = (raw: any): string => {
      if (raw == null) return "";
      let s = String(raw).trim();
      if (!s) return "";

      // strip HTML
      s = s.replace(/<[^>]+>/g, "").trim();

      // extract parenthesis content (preferred firstname)
      const parenMatch = s.match(/\(([^)]+)\)/);
      const paren = parenMatch ? parenMatch[1].trim() : "";

      // remove parenthetical part for parsing
      const noParen = s.replace(/\([^)]+\)/g, "").trim();

      // split last, rest by comma
      const parts = noParen.split(",");
      const baseLast = parts[0] ? parts[0].trim() : "";
      const right = parts[1] ? parts[1].trim() : "";

      // tokens on the right may include initials and prefix particles (van, de, etc.)
      let tokens = right ? right.split(/\s+/).filter(Boolean) : [];

      // filter out obvious initials like 'C.M.' or 'B.' or single letters
      tokens = tokens.filter((t) => !/^([A-Z](?:\.|$))+$/.test(t) && !/^[A-Z]$/.test(t));

      // prefix tokens usually start with lowercase (van, de, van der, 't, etc.)
      const prefixTokens = tokens.filter((t) => /^[a-zà-ž'’`-]/.test(t));
      const remainingTokens = tokens.filter((t) => !prefixTokens.includes(t));

      const firstname = paren || remainingTokens.filter(t => /^[A-Za-zÀ-ž].{1,}$/.test(t)).join(" ") || "";

      const surname = baseLast ? (prefixTokens.length ? prefixTokens.join(" ") + " " + baseLast : baseLast) : baseLast;

      if (!firstname) return surname || s;
      return surname ? `${firstname} ${surname}` : firstname;
    };

    // Find the index of the 'Naam' column (header may have been set earlier)
    const headerLower = filtered_ws_data[0].map((h) => (h == null ? "" : String(h).trim().toLowerCase()));
    const naamIndex = headerLower.findIndex((h) => h === "naam");
    if (naamIndex >= 0) {
      for (let r = 1; r < filtered_ws_data.length; r++) {
        filtered_ws_data[r][naamIndex] = formatName(filtered_ws_data[r][naamIndex]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(filtered_ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    XLSX.writeFile(wb, "export.xlsx");
  }
};
