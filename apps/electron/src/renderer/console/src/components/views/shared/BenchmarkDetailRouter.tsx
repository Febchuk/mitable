import { useUser } from "../../../context/UserContext";
import { BenchmarkDetail } from "../admin/BenchmarksView/BenchmarkDetail";
import { BenchmarkDetailView } from "../employee/BenchmarksView/BenchmarkDetailView";

export default function BenchmarkDetailRouter() {
  const { user, viewMode } = useUser();

  if ((user?.role === "admin" || user?.isManager) && viewMode === "manager") {
    return <BenchmarkDetail />;
  }

  return <BenchmarkDetailView />;
}
