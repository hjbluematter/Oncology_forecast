import { useState, useEffect, createContext, useContext } from "react";

const API = "http://localhost:3001/api";

export const ForecastContext = createContext(null);

export function useForecast() {
  return useContext(ForecastContext);
}

export function ForecastProvider({ children }) {
  const [models, setModels]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [view, setView]             = useState("dashboard");
  const [activeModelId, setActiveModelId] = useState(null);
  const [editingModel, setEditingModel]   = useState(null);
  const [portfolioConfig, setPortfolioConfig] = useState(null);

  useEffect(() => {
    fetch(`${API}/models`)
      .then((r) => r.json())
      .then((data) => { setModels(data); setLoading(false); })
      .catch(() => { setError("Cannot reach backend — is the server running?"); setLoading(false); });
  }, []);

  async function addModel(model) {
    const res = await fetch(`${API}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model),
    });
    const saved = await res.json();
    setModels((prev) => [saved, ...prev]);
    setActiveModelId(saved.id);
    setEditingModel(null);
    setView("model-detail");
  }

  async function saveEditedModel(id, patch) {
    const res = await fetch(`${API}/models/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated = await res.json();
    setModels((prev) => prev.map((m) => (m.id === id ? updated : m)));
    setEditingModel(null);
    setActiveModelId(id);
    setView("model-detail");
  }

  async function deleteModel(id) {
    await fetch(`${API}/models/${id}`, { method: "DELETE" });
    setModels((prev) => prev.filter((m) => m.id !== id));
  }

  function openModel(id) {
    setActiveModelId(id);
    setView("model-detail");
  }

  function openEditModel(model) {
    setEditingModel(model);
    setView("new-model");
  }

  function updateModel(id, patch) {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }

  const activeModel = models.find((m) => m.id === activeModelId);

  return (
    <ForecastContext.Provider
      value={{
        models, loading, error,
        addModel, saveEditedModel, deleteModel,
        openModel, openEditModel, updateModel,
        view, setView,
        activeModel, editingModel,
        portfolioConfig, setPortfolioConfig,
      }}
    >
      {children}
    </ForecastContext.Provider>
  );
}
