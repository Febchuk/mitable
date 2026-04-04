import { useUser } from "../../../context/UserContext";
import BenchmarksView from "../admin/BenchmarksView";
import EmployeeBenchmarksView from "../employee/BenchmarksView";

export default function BenchmarksRouter() {
  const { user } = useUser();

  // Admins and managers get the full benchmarks management view
  if (user?.role === "admin" || user?.isManager) {
    return <BenchmarksView />;
  }

  return <EmployeeBenchmarksView />;
}
