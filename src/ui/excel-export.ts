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

    const ws = XLSX.utils.aoa_to_sheet(filtered_ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    XLSX.writeFile(wb, "export.xlsx");
  }
};
