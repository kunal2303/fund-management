import { AnimatePresence, motion } from "framer-motion";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { db } from "./firebase";
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const STORAGE_KEY = "sip-investment-tracker:v2";
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric"
});
const pageMotion = {
  initial: { y: 18 },
  animate: { y: 0 },
  exit: { y: -12 },
  transition: { duration: 0.35, ease: "easeOut" }
};
const cardMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" }
};
const cardVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } }
};

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function parseLocalDate(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function addMonths(date, months) {
  const next = new Date(date);
  const expectedMonth = next.getMonth() + months;
  next.setMonth(expectedMonth);

  if (next.getMonth() !== ((expectedMonth % 12) + 12) % 12) {
    next.setDate(0);
  }

  return next;
}

function getInstallments(fund) {
  const startDate = parseLocalDate(fund.startDate);
  const today = getToday();

  if (!startDate || startDate > today) {
    return [];
  }

  const installments = [];
  let cursor = new Date(startDate);

  while (cursor <= today) {
    installments.push(new Date(cursor));
    cursor = addMonths(startDate, installments.length);
  }

  return installments;
}

function getFundStats(fund) {
  const months = getInstallments(fund).length;
  const monthlyAmount = Number(fund.monthlyAmount) || 0;
  const invested = months * monthlyAmount;
  const hasCurrentValue = fund.currentValue !== "" && fund.currentValue !== null && fund.currentValue !== undefined && Number(fund.currentValue) !== 0 && !Number.isNaN(Number(fund.currentValue));
  const hasReturnPercent = fund.returnPercent !== "" && fund.returnPercent !== null && fund.returnPercent !== undefined && !Number.isNaN(Number(fund.returnPercent));
  const savedCurrentValue = hasCurrentValue ? Number(fund.currentValue) : 0;
  const savedReturnPercent = hasReturnPercent ? Number(fund.returnPercent) : 0;
  const hasReturnData = hasCurrentValue || hasReturnPercent;
  const currentValue =
    hasCurrentValue ? savedCurrentValue : invested > 0 && hasReturnPercent ? invested * (1 + savedReturnPercent / 100) : 0;
  const profit = hasReturnData ? currentValue - invested : 0;
  const returnPercent = invested > 0 && hasReturnData ? (profit / invested) * 100 : 0;

  return { months, invested, currentValue, profit, returnPercent, hasReturnData };
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function formatDate(value) {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

function App() {
  const [activeProfile, setActiveProfile] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [profileDraft, setProfileDraft] = useState({ name: "", phone: "", passcode: "" });
  const [loginDraft, setLoginDraft] = useState({ phone: "", passcode: "" });
  const [fundDraft, setFundDraft] = useState(getEmptyFundDraft);
  const [showFundForm, setShowFundForm] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState("");

  useEffect(() => {
    async function loadSession() {
      const phone = localStorage.getItem("active-phone");
      if (phone) {
        try {
          const q = query(collection(db, "profiles"), where("phone", "==", phone));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setActiveProfile(snapshot.docs[0].data());
          } else {
            localStorage.removeItem("active-phone");
          }
        } catch (e) {
          console.error("Cloud Error", e);
        }
      }
      setIsInitializing(false);
    }
    loadSession();
  }, []);

  useEffect(() => {
    if (!activeProfile?.id) return;
    
    // Real-time synchronization across devices
    const unsubscribe = onSnapshot(doc(db, "profiles", activeProfile.id), (docSnap) => {
      if (docSnap.exists()) {
        setActiveProfile(docSnap.data());
      } else {
        localStorage.removeItem("active-phone");
        setActiveProfile(null);
      }
    });

    return () => unsubscribe();
  }, [activeProfile?.id]);

  const totals = useMemo(() => {
    if (!activeProfile) {
      return { invested: 0, months: 0, currentValue: 0, profit: 0, returnPercent: 0 };
    }

    const safeFunds = activeProfile.funds || [];
    const summary = safeFunds.reduce(
      (result, fund) => {
        const stats = getFundStats(fund);
        result.invested += stats.invested;
        result.months += stats.months;
        if (stats.hasReturnData) {
          result.currentValue += stats.currentValue;
          result.profit += stats.profit;
          result.returnFunds += 1;
        }
        return result;
      },
      { invested: 0, months: 0, currentValue: 0, profit: 0, returnFunds: 0 }
    );

    return {
      ...summary,
      hasReturnData: summary.returnFunds > 0,
      returnPercent: summary.invested > 0 && summary.returnFunds > 0 ? (summary.profit / summary.invested) * 100 : 0
    };
  }, [activeProfile]);

  const selectedFund = useMemo(() => {
    if (!activeProfile?.funds.length) {
      return null;
    }

    return (activeProfile.funds || []).find((fund) => fund.id === selectedFundId) || (activeProfile.funds || [])[0];
  }, [activeProfile, selectedFundId]);

  useEffect(() => {
    if (selectedFund && selectedFund.id !== selectedFundId) {
      setSelectedFundId(selectedFund.id);
    }
  }, [selectedFund, selectedFundId]);

  async function syncProfileUpdate(updatedProfile) {
    setActiveProfile(updatedProfile);
    setIsSyncing(true);
    try {
      await setDoc(doc(db, "profiles", updatedProfile.id), updatedProfile);
    } catch(e) {
      console.error("Failed to sync to cloud", e);
      alert("Failed to sync to cloud. Changes are only local. " + (e.message || String(e)));
    }
    setIsSyncing(false);
  }

  async function handleOpenPortfolioSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const passcodeEl = form.elements.openPasscode;
    const phoneEl = form.elements.openPhone;

    if (profileDraft.passcode.length !== 6) {
      passcodeEl.setCustomValidity("Enter a 6 digit passcode.");
      passcodeEl.reportValidity();
      return;
    }
    passcodeEl.setCustomValidity("");
    phoneEl.setCustomValidity("");

    const name = normalizeName(profileDraft.name);
    const phone = normalizePhone(profileDraft.phone);
    const passcode = profileDraft.passcode;

    setIsSyncing(true);
    try {
      const q = query(collection(db, "profiles"), where("phone", "==", phone));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        phoneEl.setCustomValidity("Phone number already registered.");
        phoneEl.reportValidity();
        setIsSyncing(false);
        return;
      } else {
        let migratedFunds = [];
        try {
          const oldData = localStorage.getItem(STORAGE_KEY);
          if (oldData) {
            const parsed = JSON.parse(oldData);
            if (parsed && Array.isArray(parsed.funds)) {
              migratedFunds = parsed.funds;
            } else if (Array.isArray(parsed)) {
              migratedFunds = parsed;
            }
          }
        } catch(e) {}

        const profile = { id: createId("profile"), name, phone, passcode, funds: migratedFunds };
        await setDoc(doc(db, "profiles", profile.id), profile);
        setActiveProfile(profile);
      }
      localStorage.setItem("active-phone", phone);
      setProfileDraft({ name: "", phone: "", passcode: "" });
    } catch(e) {
      console.error(e);
      alert("Network error: " + (e.message || String(e)));
    }
    setIsSyncing(false);
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const phoneEl = form.elements.loginPhone;
    const passcodeEl = form.elements.loginPasscode;

    const phone = normalizePhone(loginDraft.phone);
    const passcode = loginDraft.passcode;

    setIsSyncing(true);
    try {
      const q = query(collection(db, "profiles"), where("phone", "==", phone));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        phoneEl.setCustomValidity("No portfolio found for this mobile number.");
        phoneEl.reportValidity();
        setIsSyncing(false);
        return;
      }
      phoneEl.setCustomValidity("");

      const existingProfile = snapshot.docs[0].data();
      if (existingProfile.passcode !== passcode) {
        passcodeEl.setCustomValidity("Passcode does not match this portfolio.");
        passcodeEl.reportValidity();
        setIsSyncing(false);
        return;
      }
      passcodeEl.setCustomValidity("");

      setActiveProfile(existingProfile);
      localStorage.setItem("active-phone", phone);
      setLoginDraft({ phone: "", passcode: "" });
    } catch (e) {
      console.error(e);
      alert("Network error: " + (e.message || String(e)));
    }
    setIsSyncing(false);
  }

  function handleFundSubmit(event) {
    event.preventDefault();
    if (!activeProfile) return;

    const fund = {
      id: fundDraft.id || createId("fund"),
      name: normalizeName(fundDraft.name),
      monthlyAmount: Number(fundDraft.monthlyAmount),
      startDate: fundDraft.startDate,
      currentValue: fundDraft.currentValue === "" ? "" : Number(fundDraft.currentValue),
      returnPercent: fundDraft.returnPercent === "" ? "" : Number(fundDraft.returnPercent)
    };

    const nextProfile = structuredClone(activeProfile);
    if (!nextProfile.funds) nextProfile.funds = [];
    const fundIndex = nextProfile.funds.findIndex((item) => item.id === fund.id);

    if (fundIndex >= 0) {
      nextProfile.funds[fundIndex] = fund;
    } else {
      nextProfile.funds.push(fund);
    }

    syncProfileUpdate(nextProfile);
    setSelectedFundId(fund.id);
    setFundDraft(getEmptyFundDraft());
    setShowFundForm(false);
  }

  function editFund(fund) {
    setFundDraft({
      id: fund.id,
      name: fund.name,
      monthlyAmount: String(fund.monthlyAmount),
      startDate: fund.startDate,
      currentValue: fund.currentValue !== "" && fund.currentValue != null ? String(fund.currentValue) : "",
      returnPercent: fund.returnPercent !== "" && fund.returnPercent != null ? String(fund.returnPercent) : ""
    });
    setSelectedFundId(fund.id);
    setShowFundForm(true);
  }

  function deleteFund(fundId) {
    const nextProfile = structuredClone(activeProfile);
    nextProfile.funds = (nextProfile.funds || []).filter((fund) => fund.id !== fundId);
    syncProfileUpdate(nextProfile);
    setFundDraft(getEmptyFundDraft());
    setShowFundForm(false);
  }

  async function deleteActiveProfile() {
    if (!activeProfile) return;

    const shouldDelete = window.confirm(`Delete ${activeProfile.name}'s profile and all funds permanently?`);
    if (!shouldDelete) return;

    setIsSyncing(true);
    try {
      await deleteDoc(doc(db, "profiles", activeProfile.id));
      localStorage.removeItem("active-phone");
      setActiveProfile(null);
      setFundDraft(getEmptyFundDraft());
      setShowFundForm(false);
      setSelectedFundId("");
    } catch(e) {
      console.error(e);
      alert("Failed to delete profile: " + (e.message || String(e)));
    }
    setIsSyncing(false);
  }

  function switchProfile() {
    localStorage.removeItem("active-phone");
    setActiveProfile(null);
  }

  if (isInitializing) {
    return (
      <motion.main className="app-shell" {...pageMotion}>
        <p style={{ textAlign: "center", marginTop: "4rem", color: "var(--muted)", fontWeight: "600", fontSize: "1.1rem" }}>
          Connecting to Cloud...
        </p>
      </motion.main>
    );
  }

  if (activeProfile) {
    return (
      <motion.main className="app-shell dashboard-shell" {...pageMotion}>
        <section className="portfolio" aria-live="polite">
          <motion.div className="toolbar" {...cardMotion}>
            <div>
              <p className="eyebrow">Portfolio {isSyncing && <span style={{fontSize: "0.7em", opacity: 0.7}}>(Syncing...)</span>}</p>
              <h2>{activeProfile.name}'s funds</h2>
              <p className="profile-phone">{activeProfile.phone}</p>
            </div>
            <div className="profile-actions">
              <button className="secondary" type="button" disabled={isSyncing} onClick={switchProfile}>
                Logout
              </button>
              <button className="danger" type="button" onClick={deleteActiveProfile}>
                Delete profile
              </button>
            </div>
          </motion.div>

          <SummaryGrid totals={totals} />

          <div className="dashboard-actions">
            <button type="button" onClick={() => { setFundDraft(getEmptyFundDraft()); setShowFundForm(true); }}>
              Add fund
            </button>
          </div>

          <motion.section className={`entry-layout ${showFundForm && !fundDraft.id ? "" : "fund-list-only"}`} initial="initial" animate="animate" variants={{ initial: {}, animate: { transition: { staggerChildren: 0.08 } } }}>
            <AnimatePresence mode="popLayout">
              {showFundForm && !fundDraft.id && (
                <FundForm
                  key="add-fund-form"
                  draft={fundDraft}
                  setDraft={setFundDraft}
                  onSubmit={handleFundSubmit}
                  onCancel={() => {
                    setFundDraft(getEmptyFundDraft());
                    setShowFundForm(false);
                  }}
                />
              )}
            </AnimatePresence>
            <FundsList 
              funds={activeProfile.funds || []} 
              onEdit={editFund} 
              onDelete={deleteFund} 
              showFundForm={showFundForm}
              fundDraft={fundDraft}
              setFundDraft={setFundDraft}
              handleFundSubmit={handleFundSubmit}
              onCancelForm={() => {
                setFundDraft(getEmptyFundDraft());
                setShowFundForm(false);
              }}
            />
          </motion.section>

          <MonthlyTracker funds={activeProfile.funds || []} selectedFund={selectedFund} selectedFundId={selectedFundId} setSelectedFundId={setSelectedFundId} />
        </section>
      </motion.main>
    );
  }

  return (
    <motion.main className="app-shell" {...pageMotion}>
      <section className="top-band">
        <motion.div className="top-copy" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}>
          <p className="eyebrow">SIP portfolio</p>
          <h1>Track every monthly investment by profile.</h1>
          <p className="intro">Add a fund, set the SIP amount and start date, then watch the invested value update as months pass.</p>
        </motion.div>
        <motion.img
          className="top-image"
          alt="Notebook with financial planning notes"
          src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80"
          initial={{ opacity: 0, scale: 0.96, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
        />
      </section>

      <motion.section className="profile-panel" aria-labelledby="profile-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut", delay: 0.12 }}>
        <div>
          <p className="eyebrow">Profile</p>
          <h2 id="profile-title">{authMode === "login" ? "Login" : "Create portfolio"}</h2>
        </div>
        <div className="profile-options">
          <AnimatePresence mode="wait">
            {authMode === "login" && (
            <motion.form key="login" className="profile-form login-form" onSubmit={handleLoginSubmit} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: "easeOut" }}>
            <h3>Login</h3>
            <label>
              Mobile number
              <input
                name="loginPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={loginDraft.phone}
                onChange={(event) => setLoginDraft((current) => ({ ...current, phone: event.target.value }))}
                required
              />
            </label>
            <label>
              6 digit passcode
              <input
                name="loginPasscode"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength="6"
                autoComplete="current-password"
                value={loginDraft.passcode}
                onChange={(event) => setLoginDraft((current) => ({ ...current, passcode: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
                required
              />
            </label>
            <button type="submit">Login</button>
            <p className="form-switch">
              Account doesn't exist?
              <button className="link-button" type="button" onClick={() => setAuthMode("open")}>
                Create portfolio
              </button>
            </p>
          </motion.form>
          )}

          {authMode === "open" && (
            <motion.form key="open" className="profile-form portfolio-form" onSubmit={handleOpenPortfolioSubmit} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: "easeOut" }}>
            <h3>Create portfolio</h3>
            <label>
              Name
              <input
                name="openName"
                type="text"
                autoComplete="name"
                value={profileDraft.name}
                onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Phone number
              <input
                name="openPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={profileDraft.phone}
                onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))}
                required
              />
            </label>
            <label>
              6 digit passcode
              <input
                name="openPasscode"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength="6"
                autoComplete="new-password"
                value={profileDraft.passcode}
                onChange={(event) => setProfileDraft((current) => ({ ...current, passcode: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
                required
              />
            </label>
            <button type="submit">Create portfolio</button>
            <p className="form-switch">
              Already have an account?
              <button className="link-button" type="button" onClick={() => setAuthMode("login")}>
                Login
              </button>
            </p>
          </motion.form>
          )}
          </AnimatePresence>
        </div>
      </motion.section>

      <motion.footer 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        transition={{ delay: 0.5, duration: 0.5 }}
        style={{ textAlign: "center", paddingTop: "4rem", color: "var(--muted)", fontSize: "0.95rem" }}
      >
        Designed & Built by Kunal
      </motion.footer>
    </motion.main>
  );
}

function getEmptyFundDraft() {
  return { id: "", name: "", monthlyAmount: "", startDate: "", currentValue: "", returnPercent: "" };
}

function SummaryGrid({ totals }) {
  return (
    <motion.section className="summary-grid" aria-label="Portfolio summary" initial="initial" animate="animate" variants={{ initial: {}, animate: { transition: { staggerChildren: 0.07 } } }}>
      <motion.article className="summary-card" variants={cardVariants}>
        <span>Total invested</span>
        <strong>{currency.format(totals.invested)}</strong>
      </motion.article>
      <motion.article className="summary-card" variants={cardVariants}>
        <span>Months invested</span>
        <strong>{totals.months}</strong>
      </motion.article>
      <motion.article className="summary-card" variants={cardVariants}>
        <span>Current value</span>
        <strong>{totals.hasReturnData ? currency.format(totals.currentValue) : "-"}</strong>
      </motion.article>
      <motion.article className="summary-card" variants={cardVariants}>
        <span>Profit</span>
        <strong className={totals.hasReturnData ? (totals.profit < 0 ? "loss" : totals.profit > 0 ? "gain" : "") : ""}>
          {totals.hasReturnData ? currency.format(totals.profit) : "-"}
        </strong>
        <small className={totals.hasReturnData ? (totals.returnPercent < 0 ? "loss" : totals.returnPercent > 0 ? "gain" : "") : ""}>
          {totals.hasReturnData ? formatPercent(totals.returnPercent) : "-"}
        </small>
      </motion.article>
    </motion.section>
  );
}

function FundForm({ draft, setDraft, onSubmit, onCancel }) {
  const isEditing = Boolean(draft.id);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <motion.form layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: "easeOut" }} className="fund-form" aria-labelledby="fund-form-title" onSubmit={onSubmit}>
      <h3 id="fund-form-title">{isEditing ? "Edit fund" : "Add fund"}</h3>
      <label>
        Mutual fund or SIP name
        <input type="text" value={draft.name} onChange={(event) => updateField("name", event.target.value)} required />
      </label>
      <label>
        Monthly amount
        <input type="number" min="1" step="1" value={draft.monthlyAmount} onChange={(event) => updateField("monthlyAmount", event.target.value)} required />
      </label>
      <label>
        Start date
        <input type="date" value={draft.startDate} onChange={(event) => updateField("startDate", event.target.value)} required />
      </label>
      <label>
        Current value
        <input type="number" min="0" step="1" placeholder="Optional" value={draft.currentValue} onChange={(event) => updateField("currentValue", event.target.value)} />
      </label>
      <label>
        Return %
        <input type="number" step="0.01" placeholder="Optional" value={draft.returnPercent} onChange={(event) => updateField("returnPercent", event.target.value)} />
      </label>
      <div className="form-actions">
        <button type="submit">{isEditing ? "Update fund" : "Save fund"}</button>
        <button className="secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

function FundsList({ funds, onEdit, onDelete, showFundForm, fundDraft, setFundDraft, handleFundSubmit, onCancelForm }) {
  return (
    <div className="funds-area">
      <div className="section-heading">
        <h3>Funds</h3>
        <p>
          {funds.length} {funds.length === 1 ? "fund" : "funds"}
        </p>
      </div>
      <div className="funds-list">
        {!funds.length && <p className="empty">No funds yet.</p>}
        <AnimatePresence mode="popLayout">
          {funds.map((fund) => 
            (showFundForm && fundDraft?.id === fund.id) ? (
              <FundForm
                key={`form-${fund.id}`}
                draft={fundDraft}
                setDraft={setFundDraft}
                onSubmit={handleFundSubmit}
                onCancel={onCancelForm}
              />
            ) : (
              <FundCard key={fund.id} fund={fund} onEdit={onEdit} onDelete={onDelete} />
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FundCard({ fund, onEdit, onDelete }) {
  const stats = getFundStats(fund);
  const returnClass = stats.profit < 0 ? "loss" : stats.profit > 0 ? "gain" : "";

  return (
    <motion.article className="fund-card" layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      <header>
        <div>
          <h4>{fund.name}</h4>
          <span className="pill">
            {stats.months} {stats.months === 1 ? "month" : "months"}
          </span>
        </div>
        <strong>{currency.format(Number(fund.monthlyAmount) || 0)} / month</strong>
      </header>
      <div className="fund-metrics">
        <Metric label="Started" value={formatDate(fund.startDate)} />
        <Metric label="Invested" value={currency.format(stats.invested)} />
        <Metric label="Current" value={stats.hasReturnData ? currency.format(stats.currentValue) : "-"} />
        <Metric
          label="Profit"
          value={stats.hasReturnData ? `${currency.format(stats.profit)} (${formatPercent(stats.returnPercent)})` : "-"}
          className={stats.hasReturnData ? returnClass : ""}
        />
      </div>
      <div className="fund-actions">
        <button className="secondary" type="button" onClick={() => onEdit(fund)}>
          Edit
        </button>
        <button className="danger" type="button" onClick={() => onDelete(fund.id)}>
          Delete
        </button>
      </div>
    </motion.article>
  );
}

function Metric({ label, value, className = "" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

function MonthlyTracker({ funds, selectedFund, selectedFundId, setSelectedFundId }) {
  const installments = selectedFund ? getInstallments(selectedFund) : [];
  const monthlyAmount = Number(selectedFund?.monthlyAmount) || 0;

  return (
    <motion.section className="tracker-section" {...cardMotion}>
      <div className="section-heading">
        <h3>Monthly tracker</h3>
        <label>
          Fund
          <select value={selectedFundId} onChange={(event) => setSelectedFundId(event.target.value)}>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Amount</th>
              <th>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {!selectedFund && (
              <tr>
                <td colSpan="3">No monthly entries yet.</td>
              </tr>
            )}
            {selectedFund && !installments.length && (
              <tr>
                <td colSpan="3">The first SIP month has not arrived yet.</td>
              </tr>
            )}
            {installments.map((date, index) => (
              <tr key={date.toISOString()}>
                <td>{monthFormatter.format(date)}</td>
                <td>{currency.format(monthlyAmount)}</td>
                <td>{currency.format(monthlyAmount * (index + 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
