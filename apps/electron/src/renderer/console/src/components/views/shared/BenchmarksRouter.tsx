import { useUser } from "../../../context/UserContext";
import BenchmarksView from "../admin/BenchmarksView";
import EmployeeBenchmarksView from "../employee/BenchmarksView";

export default function BenchmarksRouter() {
  const { user, viewMode } = useUser();

  // Admin or manager views get the full benchmarks management view
  if (user?.role === "admin" || user?.isManager || viewMode === "admin" || viewMode === "manager") {
    return <BenchmarksView />;
  }

  return <EmployeeBenchmarksView />;
}
