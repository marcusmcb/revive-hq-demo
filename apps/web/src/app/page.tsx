"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { runSearch } from "../lib/api";
import type { PropertyListing, SearchMode } from "../lib/types";
import ThemeToggle from "./ThemeToggle";

const PAGE_SIZE = 10;

const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

function formatNumber(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Data not available";
  return new Intl.NumberFormat().format(value);
}

function formatPrice(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Data not available";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatText(value: string | undefined | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : "Data not available";
}

function splitAddressLines(address: string | undefined | null): { line1: string; line2: string | null } {
  const value = typeof address === "string" ? address.trim() : "";
  if (!value) return { line1: "Data not available", line2: null };

  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { line1: value, line2: null };

  return { line1: parts[0], line2: parts.slice(1).join(", ") };
}

export default function Home() {
  const [mode, setMode] = useState<SearchMode>("city");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const [sort, setSort] = useState<
    | "default"
    | "price_asc"
    | "price_desc"
    | "beds_asc"
    | "beds_desc"
    | "baths_asc"
    | "baths_desc"
    | "sqft_asc"
    | "sqft_desc"
  >("default");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PropertyListing[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastQueryLabel, setLastQueryLabel] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  const [animateResults, setAnimateResults] = useState(false);

  useEffect(() => {
    if (!animateResults) return;
    const id = window.setTimeout(() => setAnimateResults(false), 1000);
    return () => window.clearTimeout(id);
  }, [animateResults]);

  const totalPages = useMemo(() => {
    const count = results.length;
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }, [results.length]);

  const sortedResults = useMemo(() => {
    if (sort === "default") return results;

    const [field, dir] = sort.split("_") as ["price" | "beds" | "baths" | "sqft", "asc" | "desc"];
    const getValue = (p: PropertyListing): number | null => {
      const v = p[field];
      return typeof v === "number" && !Number.isNaN(v) ? v : null;
    };

    const withIndex = results.map((p, index) => ({ p, index }));
    withIndex.sort((a, b) => {
      const av = getValue(a.p);
      const bv = getValue(b.p);

      if (av === null && bv === null) return a.index - b.index;
      if (av === null) return 1;
      if (bv === null) return -1;

      if (av === bv) return a.index - b.index;
      return dir === "asc" ? av - bv : bv - av;
    });

    return withIndex.map((x) => x.p);
  }, [results, sort]);

  const pagedResults = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedResults.slice(start, start + PAGE_SIZE);
  }, [page, sortedResults]);

  function resetResults() {
    setError(null);
    setResults([]);
    setPage(1);
    setHasSearched(false);
    setLastQueryLabel(null);
  }

  function clearSearch() {
    setAddress("");
    setCity("");
    setState("");
    setSort("default");
    setLoading(false);
    resetResults();
  }

  function validate(): string | null {
    if (mode === "address") {
      const value = address.trim();
      if (value.length < 5) return "Please enter a full street address.";
      return null;
    }

    const c = city.trim();
    const s = state.trim().toUpperCase();
    if (c.length < 2) return "Please enter a city.";
    if (!/^[A-Z]{2}$/.test(s) || !US_STATE_CODES.has(s)) {
      return "Please enter a valid 2-letter US state code (e.g., TX).";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setResults([]);
    setPage(1);
    setHasSearched(false);

    const queryLabel =
      mode === "address"
        ? address.trim()
        : `${city.trim()}, ${state.trim().toUpperCase()}`;
    setLastQueryLabel(queryLabel);

    try {
      const body =
        mode === "address"
          ? { mode, address: address.trim() }
          : { mode, city: city.trim(), state: state.trim().toUpperCase(), limit: 100 };
      const response = await runSearch(body);
      setResults(response.properties);
      setHasSearched(true);

      if (Array.isArray(response.properties) && response.properties.length > 0) {
        setAnimateResults(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      const maybeStatus = (err as { status?: unknown } | null)?.status;
      const status = typeof maybeStatus === "number" ? maybeStatus : undefined;

      if (mode === "address" && (status === 404 || /address not found/i.test(message))) {
        setError(null);
        setResults([]);
        setHasSearched(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Property Search</h1>
              <ThemeToggle className={`${styles.secondaryButton} ${styles.themeToggle}`} />
            </div>
            <p className={styles.subtitle}>
              Search active listings by address or by city and state.
            </p>
          </div>

          {loading || hasSearched ? (
            <section className={styles.resultsHeaderPanel}>
              {loading ? (
                <div className={styles.resultsHeader} role="status" aria-live="polite">
                  <div className={styles.resultsTitleRow}>
                    <h2>Searching…</h2>
                  </div>
                </div>
              ) : (
                <div className={styles.resultsHeader}>
                  <div className={styles.resultsTitleRow}>
                    <h2>Results</h2>
                    <span className={styles.listingCount}>{results.length} listing(s)</span>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className={styles.sidebar}>
            <form className={styles.form} onSubmit={onSubmit}>
              <fieldset className={styles.fieldset} disabled={loading}>
                <div className={styles.modeToggle} role="group" aria-label="Search mode">
                  <button
                    type="button"
                    className={
                      mode === "city"
                        ? `${styles.modeButton} ${styles.modeButtonActive}`
                        : styles.modeButton
                    }
                    aria-pressed={mode === "city"}
                    onClick={() => {
                      if (mode === "city") return;
                      setMode("city");
                    }}
                  >
                    City/state
                  </button>
                  <button
                    type="button"
                    className={
                      mode === "address"
                        ? `${styles.modeButton} ${styles.modeButtonActive}`
                        : styles.modeButton
                    }
                    aria-pressed={mode === "address"}
                    onClick={() => {
                      if (mode === "address") return;
                      setMode("address");
                    }}
                  >
                    Single address
                  </button>
                </div>

                {mode === "address" ? (
                  <label className={styles.label}>
                    Address
                    <input
                      className={styles.input}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder='e.g. "123 Main St, Austin, TX 78701"'
                    />
                  </label>
                ) : (
                  <div className={styles.row}>
                    <label className={styles.label}>
                      City
                      <input
                        className={styles.input}
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder='e.g. "Nashville"'
                      />
                    </label>
                    <label className={styles.label}>
                      State
                      <input
                        className={styles.input}
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder='e.g. "TN"'
                      />
                    </label>
                  </div>
                )}

                <button className={styles.button} type="submit">
                  {loading ? "Searching…" : "Search"}
                </button>

                <button
                  className={`${styles.secondaryButton} ${styles.clearButton}`}
                  type="button"
                  onClick={clearSearch}
                >
                  Clear Search
                </button>
              </fieldset>
            </form>

            {error ? <div className={styles.error}>{error}</div> : null}
          </section>

          <section className={styles.resultsPanel}>
            {!loading && !error && hasSearched && results.length === 0 ? (
              <div className={styles.emptyState} role="status" aria-live="polite">
                {mode === "city" ? (
                  <>
                    No results found for {lastQueryLabel || "that city/state"}. Please select
                    {" \"Clear Search\" "}
                    to try again.
                  </>
                ) : (
                  <>
                    No results found for that address. Please select{" \"Clear Search\" "}to try
                    again.
                  </>
                )}
              </div>
            ) : null}

            {mode === "city" && results.length > PAGE_SIZE ? (
              <div className={styles.pagination}>
                <div className={styles.paginationLeft}>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    type="button"
                  >
                    Prev
                  </button>
                  <span>
                    Page {page} / {totalPages}
                  </span>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    type="button"
                  >
                    Next
                  </button>
                </div>

                <div className={styles.sortControl}>
                  <label className={styles.sortLabel} htmlFor="sort-city">
                    Sort
                  </label>
                  <select
                    id="sort-city"
                    className={styles.select}
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as typeof sort);
                      setPage(1);
                    }}
                  >
                    <option value="default">Default</option>
                    <option value="price_asc">Price (Low → High)</option>
                    <option value="price_desc">Price (High → Low)</option>
                    <option value="baths_asc">Bathrooms (Low → High)</option>
                    <option value="baths_desc">Bathrooms (High → Low)</option>
                    <option value="beds_asc">Bedrooms (Low → High)</option>
                    <option value="beds_desc">Bedrooms (High → Low)</option>
                    <option value="sqft_asc">Sq. Feet (Low → High)</option>
                    <option value="sqft_desc">Sq. Feet (High → Low)</option>
                  </select>
                </div>
              </div>
            ) : null}

            {mode === "city" && results.length > 1 && results.length <= PAGE_SIZE ? (
              <div className={styles.sortRow}>
                <div className={styles.sortControl}>
                  <label className={styles.sortLabel} htmlFor="sort-city">
                    Sort
                  </label>
                  <select
                    id="sort-city"
                    className={styles.select}
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as typeof sort);
                      setPage(1);
                    }}
                  >
                    <option value="default">Default</option>
                    <option value="price_asc">Price (Low → High)</option>
                    <option value="price_desc">Price (High → Low)</option>
                    <option value="baths_asc">Bathrooms (Low → High)</option>
                    <option value="baths_desc">Bathrooms (High → Low)</option>
                    <option value="beds_asc">Bedrooms (Low → High)</option>
                    <option value="beds_desc">Bedrooms (High → Low)</option>
                    <option value="sqft_asc">Sq. Feet (Low → High)</option>
                    <option value="sqft_desc">Sq. Feet (High → Low)</option>
                  </select>
                </div>
              </div>
            ) : null}

            {mode === "address" && results.length > 1 ? (
              <div className={styles.sortRow}>
                <div className={styles.sortControl}>
                  <label className={styles.sortLabel} htmlFor="sort-address">
                    Sort
                  </label>
                  <select
                    id="sort-address"
                    className={styles.select}
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                  >
                    <option value="default">Default</option>
                    <option value="price_asc">Price (Low → High)</option>
                    <option value="price_desc">Price (High → Low)</option>
                    <option value="baths_asc">Bathrooms (Low → High)</option>
                    <option value="baths_desc">Bathrooms (High → Low)</option>
                    <option value="beds_asc">Bedrooms (Low → High)</option>
                    <option value="beds_desc">Bedrooms (High → Low)</option>
                    <option value="sqft_asc">Sq. Feet (Low → High)</option>
                    <option value="sqft_desc">Sq. Feet (High → Low)</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className={`${styles.cards} ${animateResults ? styles.cardsEnter : ""}`}>
              {(mode === "city" ? pagedResults : sortedResults).map((p) => {
                const addr = splitAddressLines(p.address);
                return (
                  <article key={p.sourceId} className={styles.card}>
                    <div className={styles.cardBody}>
                      <div className={styles.cardAddress}>
                        <div className={styles.cardTitle}>{formatText(addr.line1)}</div>
                        {addr.line2 ? <div className={styles.cardSubTitle}>{addr.line2}</div> : null}
                      </div>
                      <div className={styles.cardGrid}>
                        <div>Price: {formatPrice(p.price)}</div>
                        <div>Bedrooms: {formatNumber(p.beds)}</div>
                        <div>Bathrooms: {formatNumber(p.baths)}</div>
                        <div>Sq. Feet: {formatNumber(p.sqft)}</div>
                      </div>
                    </div>

                  {p.photos?.length ? (
                    <div className={styles.photos}>
                      {p.photos.slice(0, 8).map((url) => (
                        <img
                          key={url}
                          className={styles.photo}
                          src={url}
                          alt="Property photo"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.noPhotos}>No photos available</div>
                  )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
