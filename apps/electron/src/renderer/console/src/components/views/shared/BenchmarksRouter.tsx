import { useUser } from "../../../context/UserContext";
import BenchmarksView from "../admin/BenchmarksView";
import EmployeeBenchmarksView from "../employee/BenchmarksView";

export default function BenchmarksRouter() {
  const { user } = useUser();

  if (user?.role === "admin") {
    return <BenchmarksView />;
  }

  return <EmployeeBenchmarksView />;
}
