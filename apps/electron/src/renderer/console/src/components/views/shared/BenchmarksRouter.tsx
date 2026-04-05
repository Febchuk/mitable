import { useUser } from "../../../context/UserContext";
import BenchmarksView from "../admin/BenchmarksView";
import EmployeeBenchmarksView from "../employee/BenchmarksView";

export default function BenchmarksRouter() {
  const { user, viewMode } = useUser();

  // Admins and managers in Team view get the full benchmarks management view
  if ((user?.role === "admin" || user?.isManager) && viewMode === "manager") {
    return <BenchmarksView />;
  }

  // Me view always shows read-only "My Benchmarks"
  return <EmployeeBenchmarksView />;
}
