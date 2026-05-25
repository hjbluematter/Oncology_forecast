import { ForecastProvider, useForecast } from "./store/forecastStore";
import Dashboard from "./components/Dashboard";
import NewModelWizard from "./components/NewModelWizard";
import ModelDetail from "./components/ModelDetail";

function AppRouter() {
  const { view } = useForecast();
  if (view === "new-model") return <NewModelWizard />;
  if (view === "model-detail") return <ModelDetail />;
  return <Dashboard />;
}

export default function App() {
  return (
    <ForecastProvider>
      <AppRouter />
    </ForecastProvider>
  );
}
