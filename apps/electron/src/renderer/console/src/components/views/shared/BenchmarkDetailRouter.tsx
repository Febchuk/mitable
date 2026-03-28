import { useUser } from "../../../context/UserContext";
import { BenchmarkDetail } from "../admin/BenchmarksView/BenchmarkDetail";
import { BenchmarkDetailView } from "../employee/BenchmarksView/BenchmarkDetailView";

export default function BenchmarkDetailRouter() {
  const { user } = useUser();

  if (user?.role === "admin") {
    return <BenchmarkDetail />;
  }

  return <BenchmarkDetailView />;
}
