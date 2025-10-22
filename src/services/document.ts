interface DocumentLine {
  accountCode: string;
  amount: number;
  description: string;
}

interface DocumentData {
  docTypeCode: string;
  documentDate: string;
  currencyCode: string;
  description: string;
  lines: DocumentLine[];
  sessionId: string;
  persistence?: string;
}

interface CreateDocumentResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

export async function createDocument(
  documentData: DocumentData,
  baseUrl: string = "https://pr01.allunited.nl/"
): Promise<CreateDocumentResult> {
  try {
    // Build form data for document lines
    const formData = new URLSearchParams();

    // Document header
    formData.append("documentheader[documentid]", "");
    formData.append("documentheader[doctypecode]", documentData.docTypeCode);
    formData.append("documentheader[referenceid]", "");
    formData.append("documentheader[reference]", "");
    // Format document date as DD-MM-YYYY if provided as ISO YYYY-MM-DD
    const formatDate = (d: string): string => {
      if (!d) return d;
      const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
      return d;
    };

    formData.append(
      "documentheader[documentdate]",
      formatDate(documentData.documentDate)
    );
    formData.append("documentheader[currencycode]", documentData.currencyCode);
    formData.append("documentheader[revdocumentid]", "");
    // Use comma as decimal separator for locale the server expects
    const formatNumber = (n: number, decimals = 2): string => {
      const fixed = n.toFixed(decimals);
      return fixed.replace(".", ",");
    };

    formData.append(
      "documentheader[exchangerate]",
      "1.000000".replace(".", ",")
    );
    formData.append("documentheader[description]", documentData.description);
    formData.append("documentheader[templatedocid]", "");

    // Document lines
    documentData.lines.forEach((line, index) => {
      formData.append(
        `documentheader[_subforms_][documentline][${index}][s_newrow]`,
        "1"
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][documentlineid]`,
        ""
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][documentid]`,
        ""
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][accountcode]`,
        line.accountCode
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][account]`,
        ""
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][recon_id]`,
        ""
      );
      // Format amounts with 2 decimals and comma decimal separator
      formData.append(
        `documentheader[_subforms_][documentline][${index}][amount_for]`,
        formatNumber(line.amount, 2)
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][amount]`,
        formatNumber(line.amount, 2)
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][description]`,
        line.description
      );
      formData.append(
        `documentheader[_subforms_][documentline][${index}][s_update]`,
        "true"
      );
    });

    // Totals
    const total = documentData.lines.reduce(
      (sum, line) => sum + line.amount,
      0
    );
    formData.append("documentheader[amount_for]", formatNumber(total, 2));
    formData.append("documentheader[amount]", formatNumber(total, 2));

    // Session / navigation / persistence fields (optional)
    formData.append("documentheader[_persistence_]", persistence);
    formData.append("au-stack", auStack);
    formData.append("au-nav", auNav);

    // Some browser form submissions include navigation state; allow passing
    // these via persistence (au-stack / au-nav) by including if present in persistence
    // (caller can include them by setting persistence to the encoded value if needed)
    // include a timestamp similar to the browser form
    formData.append(
      "documentheader[_timestamp_]",
      String(Math.floor(Date.now() / 1000))
    );
    if (documentData.sessionId) {
      formData.append("sessionid", documentData.sessionId);
    }

    formData.append("formname", "documentheader");

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.7",
        "Cache-Control": "max-age=0",
        "Content-Type": "application/x-www-form-urlencoded",
        "Upgrade-Insecure-Requests": "1",
      },
      credentials: "include",
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const htmlResponse = await response.text();

    // Extract document ID from response
    const documentIdMatch = htmlResponse.match(
      /Document\s+'([^']+)'\s+is\s+opgeslagen/
    );

    if (documentIdMatch && documentIdMatch[1]) {
      return {
        success: true,
        documentId: documentIdMatch[1],
      };
    }

    // If we reach here, try to extract any error messages from the HTML
    try {
      const errInfo = extractErrorMessages(htmlResponse);
      if (errInfo.hasErrors) {
        const parts: string[] = [];
        if (errInfo.systemMessage) parts.push(errInfo.systemMessage);
        if (errInfo.fieldErrors && errInfo.fieldErrors.length) {
          parts.push(
            ...errInfo.fieldErrors.map((fe) => `${fe.field}: ${fe.error}`)
          );
        }

        return {
          success: false,
          error:
            parts.join(" | ") ||
            "Document created but ID could not be extracted from response",
        };
      }
    } catch (e) {
      // ignore parser errors and fallthrough to generic message
    }

    return {
      success: false,
      error: "Document created but ID could not be extracted from response",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

interface ErrorInfo {
  systemMessage?: string;
  fieldErrors?: Array<{
    field: string;
    error: string;
  }>;
  hasErrors: boolean;
}

function extractErrorMessages(htmlResponse: string): ErrorInfo {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResponse, "text/html");

  const errorInfo: ErrorInfo = {
    hasErrors: false,
    fieldErrors: [],
  };

  // 1. Extract system message block error
  const systemMessageBlock = doc.getElementById("systemMessageBlock");
  if (systemMessageBlock) {
    const messageText = systemMessageBlock.textContent?.trim();
    if (messageText) {
      errorInfo.systemMessage = messageText;
      errorInfo.hasErrors = true;
    }
  }

  // 2. Check for invalid fields
  const invalidFields = doc.querySelectorAll(".invalidField");
  invalidFields.forEach((field) => {
    const fieldName =
      field.getAttribute("name") || field.getAttribute("id") || "Unknown field";
    const fieldLabel =
      field.closest("td")?.querySelector(".text-label")?.textContent?.trim() ||
      fieldName;

    const errorMessages = field
      .closest("tr")
      ?.querySelectorAll(".error-message, .field-error");

    if (errorMessages && errorMessages.length > 0) {
      errorMessages.forEach((msg) => {
        errorInfo.fieldErrors?.push({
          field: fieldLabel,
          error: msg.textContent?.trim() || "Invalid field",
        });
      });
    } else {
      errorInfo.fieldErrors?.push({
        field: fieldLabel,
        error: "Field validation failed",
      });
    }

    errorInfo.hasErrors = true;
  });

  // 3. Look for alert or error messages in the page
  const alerts = doc.querySelectorAll(
    "[class*='error'], [class*='alert'], [class*='warning']"
  );
  alerts.forEach((alert) => {
    const alertText = alert.textContent?.trim();
    if (
      alertText &&
      alertText.length > 0 &&
      !errorInfo.systemMessage?.includes(alertText)
    ) {
      errorInfo.systemMessage =
        (errorInfo.systemMessage ? errorInfo.systemMessage + " | " : "") +
        alertText;
      errorInfo.hasErrors = true;
    }
  });

  // 4. Check for validation error spans
  const requiredAsterisks = doc.querySelectorAll(".required-asterisk");
  requiredAsterisks.forEach((asterisk) => {
    const input = asterisk
      .closest("td")
      ?.querySelector("input, select, textarea");
    if (input && input.classList.contains("invalidField")) {
      const fieldLabel =
        asterisk
          .closest("tr")
          ?.querySelector(".text-label")
          ?.textContent?.trim() ||
        input.getAttribute("name") ||
        "Unknown field";

      errorInfo.fieldErrors?.push({
        field: fieldLabel,
        error: "Required field is empty or invalid",
      });
      errorInfo.hasErrors = true;
    }
  });

  return errorInfo;
}

const persistence =
  "eWMEEU1kHS8Do4riFANXUUVsYz3Uon1sYPrFIN32qeWl1Zx5Q0oz9ZUWWrtu8Gqu5OBitOXOoMvwrEl-B8gaH5f8KknlMu1kdLv7bWT90ktEyznN8MqNbwW8YnEju_m8JQft9S6yD5C5AGkcccrDsb8_wiYc75hhsYmwTMUS7XGhXekKg8P8PR0t81h7w4V9TKsGtVv-ECqi6-XXGTqQtvHgxa1Hu7MSQVvJjNiSEbkjhn1jTGgoeayNWQTKG07O5WzwA1-_2Gbl1Pn1m5v9gYt9NL_3jsgXuXzAwrDfbg4_I77CKS0Nbf5KkszToUPYBO6F9VfZLd5wx6BZUyuieI9hRJZNa4ZNuvKlzqplLna7gdUzNFyOw9G6Rm-pouBfV4pvlMMbSGY0oWjS-DLRXHv6w7ZBJi35xyzCQImq28jkgZvNDoU0Nc1SCtFpbJMZbRlaJZKJJlZln-61Pg10hnIfLUV5-GkMJGeXOcq4pu9Ic1Y9f-546qnvICRE8sr32tVDBskp2UuCyjrfMQwZ5MZc6c7i09I6UX5KpRvOsK-laaefHmmIbquZ5TZzMCOWZ5lYyFpMluitDwGaMxF9ph5x-UBnCWTMf2nMzwjuCUa4RG-YgDYckC8dJc-uruKtbIZ0gttJ-Zu9gqBybgFfKbqKURQvfRZJWdQrmE7RXaDIHkUWJwa33ELgqs3IhyoSwUBPSNd5QQa8121YmxODlog5otoNRKtk-NXWzP1tyEcyF4nBGuL6tKa-WhMsXY8sclg7_-plPheV4-yfMgBKuW7IYv3VMZVb5N84ObI02X699o664DHqvuLUePDeX9B0MtmtyimXNA3ZNVaQJZ6FSuumI2ujlLefJRCTzHgFgvJBb39fIjz7ciq--teLIf9s2AGKxCNaAvhEFw0Xp6VOOitBZkYdGAD_FamnZMAahlaUHWfApgnf-tqBkghX64nIqcxVJK_N1TIaLN3kwfnLNW8NUWQ7ryKouYj_0W38jsAw6gk0b4Q-nPeTj76FehHOmL1KWTmjOWC2BrHyGRNbsE2aeQ83f698VrN69D-UgwrMzYbTVkONCTUDkn5WdDtdFgSZ-cxA5KRU7Ow2DjeAy-XG_fc1xvNXq7nBnCRsguFjUyhw_Muqk2tXtYC_cqBgi6GvzAy8sljc-3gdAzQDDi8V9GBIwWCH4Qzz6N1E7lhZG07ZwWv2NXWI4y5wIJ-hsHh2Gvp1m2ipCZiWwbKYbXggI-_s6hxn9tXm6ilLknHGWuM1DWBQCFJs0HGgHNbm-2vZSKOipuqfQok6oAHS1QND2Qy55Y6Nv7xHQ-041jfwtTb-jvpewNqZN2ZtaHoxe5balX7jDNu_boZBrbzmB7pmB1DR-QNtbmy8d4n4FIApGcIUIZpe9Cbs_quZSb6neXNrwfqaCphJ76D-RrZFIPatJWR2H5if7AymL6m9SgYZWSlQXaRngkH3HwaNjXA_hax4zpLF72l2r6DqGl7C5KfnUKc0-OEPa2Tl3njFo-MofHl8dLIgxN7NoQXrm9Kli1fwL3KCAg8TuTvma-w3JTImn8q62BHao35ufOe11XV6HMwzSUSVBqN6TTESFjmNA6mn-KqHQed3drBet_pIFlkZRIgTmbbywxdlzDYXdffo8OAcMBT5W1PQgCCgoTh3WecDIobO4b77d_rqpbuDrSySXxobLDR0wbjE4Fxe4FwJ-e2gT2-d8kjV6oAOhfh26aErm7ETX0zqagTqa2OFRm5FXcE_-ii4zui9ogVoPqTt5kCTSeomJ_I22s80kImcpQ7Phg6mM3EGFYy7JzX2X7KdQDnHdBzYMg35RbhFSI5Kj7-pZDegqMx1tSiuCDspuEhE-GEQHp7_SjzRdduk4Qlt31i5iwN7y-6SbIK2o3__ra3yZhMZ8it5noCPqFT9tSakUCktRNnsK99QVsJiFXPs67GjmTdTQ4V3TSRLsc6SaabZgvjzFCSUSinY4PSwWimWaU84a8wPIqDnpxJqQCZL8YQuXcDExP6Yoel1kUPk79vzNrtuPRW9X1gLnnwl098V6vXRYG07kv8vgQcrKfwNkpse8-ANXDSU99zBSr64hN3nMdCb3jV9_E942aWAcoJzcKPOn-ccyaLTlVivXHu5KInBkYtjQOvHYdqSgoyJABYpv2Gcp44EGUag1gAqMx8CW9muoASwRbvO7kzeAP4P-bC3HcIA_wgG5y_E7H9WcW3aUcdi89gMXgAcvQDgICxXBxL2LCQzrdowFbVuuXtWlgQfyAxiYa2B02AlypYqwHlywzzaj3g5hEWqAodQUwsiHyvX5BYsHR5-hEG9TdzammQBCgbKldj-HbrLud18Xq6V4xz20MxhCLyOs10iOW_BFgPUeVCKciyzJhBFo-UrX7GamGE1T0fjkv48JPBt9D-E3DyTlWWT5Z5NzQBbIpHPbzlybWkW1avzRi0joaxNQB3sHcwBV5uMD6c6WT0rrh0JHTywDMWZRu-bXtjfZ5LBd16GVDpvNRbXcFFRQi1xxpZ1cJGdVIGc1sPuBc_XGakt5sLvbr6eU_9t-AYseaHsg92W2euhnfxJBhgFgRsNRVctk13gBeRa5DGG1npGlPJXII7KSw1-vfzJ7l-0elNoXaEQowX52LFz3shJWbynUrjo0hzez4gfLdZGBUPiXUqMarbXXRfKBIUTXWZFmwUo2QHcWZvz5nCJf0vpwU1bFPiKUv-vM9Q7qz_6DdyAMdi_DXqwkzNNzCHE5jXVMo0x5FBMImOmtWc0WQwJ8rVjrRji0fT-sD8JX9nyfCzOJFciSRr-P3xNgmjQloOaoSVw10osrRBxQFwK7OQPxmUXemkDrX9oKctGGgy2e9gHqSvUkQdsDM9OyiXD8lyisMQzLDejaxMO7DRnNh14NGAvRGHpR2BPP-FjysgNvngJSz_0Djg2airAUkA_MDDl9J8nrFg0nRv3WE1-3SMHoQ6oLL6I5voeoIzJh8T1FgawlAXOI0_sUELNZzcu7byrogdNwerJ1GiRYiTW0SZpYmQVxUb0SjpnLFAWwR9wyiw0lpzaofKillBb_P9dsLmlctEqP7RWIsC5ijT6_TeBTKS1rWqlgQP77--OMnLyM73d9_T7U2BWkUYxB3A5u3U4JKu9VUsIMi9acWpkp4FF-jlO18Ek0-u3fcvIynHPz9JaCl60g8SKS8KGIBv-hhVfuHyR0ThOAIxvZyjrfxFpdONJJFizRUmNkCHhn1QP-hdurJ7nzzfxsLLMidO_VXGmwa5AQyOLYsDnqvvYE1loLi7grV6KyoTxY00SY1JbI72mxRVNf1cG0vPpEVGEFzpA38MQHCMxfeS-PYBPvFEU_AbFYuULBXVRvtJhG7tnVkQmeQBrQFRtBoa8Xvu1P8rJs_W0O0rwbB1LlT2RPaxLTw";
const auStack =
  "YToyOntpOjA7TzoxOToiQWxsVW5pdGVkXERWODBcUGFnZSI6MTA6e3M6MTE6InRyYW5zYWN0aW9uIjtzOjEwOiJhY2NvdW50aW5nIjtzOjU6InRtb2RlIjtzOjY6InNlbGVjdCI7czo1OiJwbW9kZSI7aTozO3M6MTU6Im5leHR0cmFuc2FjdGlvbiI7TjtzOjk6Im5leHR0bW9kZSI7TjtzOjk6Im5leHRwbW9kZSI7TjtzOjU6IndoZXJlIjtOO3M6NDoiZm9ybSI7YToxOntzOjE0OiJzZWxlY3Rkb2N1bWVudCI7YTo4OntzOjEwOiJkb2N1bWVudGlkIjthOjU6e3M6MToicyI7czoyOiJFUSI7czoxOiJ3IjtzOjE6InciO3M6MToiZiI7czo4OiIzMDAxMjI5NyI7czoxOiJ0IjtzOjA6IiI7czo4OiJzX3VwZGF0ZSI7czo0OiJ0cnVlIjt9czoxMjoiZG9jdW1lbnRkYXRlIjthOjQ6e3M6MToicyI7czowOiIiO3M6MToidyI7czoxOiJ3IjtzOjE6ImYiO3M6MDoiIjtzOjE6InQiO3M6MDoiIjt9czoxMToiZGVzY3JpcHRpb24iO2E6Mzp7czoxOiJzIjtzOjA6IiI7czoxOiJ3IjtzOjE6InciO3M6MToiZiI7czowOiIiO31zOjg6ImVkaXRkYXRlIjthOjQ6e3M6MToicyI7czowOiIiO3M6MToidyI7czoxOiJ3IjtzOjE6ImYiO3M6MDoiIjtzOjE6InQiO3M6MDoiIjt9czoxMDoiZWRpdHVzZXJpZCI7YTozOntzOjE6InMiO3M6MDoiIjtzOjE6InciO3M6MToidyI7czoxOiJmIjtzOjA6IiI7fXM6ODoidGVtcGxhdGUiO2E6Mzp7czoxOiJzIjtzOjA6IiI7czoxOiJ3IjtzOjE6InciO3M6MToiZiI7Tjt9czoxMToiX3RpbWVzdGFtcF8iO3M6MTA6IjE3NjExNTI4NjEiO3M6MTg6Il9zZWxlY3Rpb25yZXN1bHRzXyI7YToxOntpOjA7YTo0OntzOjEwOiJkb2N1bWVudGlkIjtzOjg6IjMwMDEyMjk3IjtzOjEyOiJkb2N1bWVudGRhdGUiO3M6MTA6IjIwMjUtMTAtMjIiO3M6MTE6ImRlc2NyaXB0aW9uIjtzOjQ6InRlc3QiO3M6MTA6ImVkaXR1c2VyaWQiO3M6NzoiUEVOTklORyI7fX19fXM6Nzoib3JkZXJieSI7TjtzOjE2OiJzY3JpcHRyZXN1bHRwYWdlIjtpOjE7fWk6MTtPOjE5OiJBbGxVbml0ZWRcRFY4MFxQYWdlIjoxMDp7czoxMToidHJhbnNhY3Rpb24iO3M6MTA6ImFjY291bnRpbmciO3M6NToidG1vZGUiO3M6ODoiZG9jdW1lbnQiO3M6NToicG1vZGUiO2k6MztzOjE1OiJuZXh0dHJhbnNhY3Rpb24iO047czo5OiJuZXh0dG1vZGUiO047czo5OiJuZXh0cG1vZGUiO047czo1OiJ3aGVyZSI7TjtzOjQ6ImZvcm0iO047czo3OiJvcmRlcmJ5IjtOO3M6MTY6InNjcmlwdHJlc3VsdHBhZ2UiO2k6MTt9fQ==";
const auNav =
  "abKjCKc-ca0GDKnQwGZf0hRdrvjAj-Xr2gXLmeBSrdivEDTxS_bPty005hL-THI-UvNBm5KC_VC8a0sQTjJ3R1cAtkIVBivhU4q1_r2jWl2bvt7RZOTZBHnY4AhiAG3RsxpZv9PfkRVoCtFUBEvZLT7ekvyVIcSXssLSSS8SWJvUmHiQWdCSJtocggKPdAeldF43Rj7A7wkwwv-auxsfiMDG4p2wKQYDBBSi-u7WzT06dUBd19V61aA9QDa8WV6u3u2at7zESSQb2q9_C-xh0jKJKrqORm3HDtHEIopholtAqze4XCgwAUAY4Ezx2CD7SKRXKpT5_p9jX_V00N_Q1rJwFxiZZfscdhceQAdDZ0OWCI_PP7MwAZuKSogANGfTCjY7hKn1OltqvdDGnWWprbcpIT3CBRcVOvf6PdrzDzsbBLm7h9nLXfJRRlD9aY1DVOfzXqEv6NWA2WaqtDP6zA";
