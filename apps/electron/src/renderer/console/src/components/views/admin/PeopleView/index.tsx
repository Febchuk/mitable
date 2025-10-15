import { Search, Filter, Plus } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  role: string;
  startDate: string;
  status: "Onboarding" | "Active";
  progress: number;
}

const mockEmployees: Employee[] = [
  {
    id: "1",
    name: "Sarah Chen",
    role: "Software Engineer",
    startDate: "Oct 1, 2025",
    status: "Onboarding",
    progress: 60,
  },
  {
    id: "2",
    name: "Marcus Johnson",
    role: "Product Designer",
    startDate: "Sep 15, 2025",
    status: "Active",
    progress: 100,
  },
  {
    id: "3",
    name: "Emily Rodriguez",
    role: "Marketing Manager",
    startDate: "Oct 8, 2025",
    status: "Onboarding",
    progress: 35,
  },
  {
    id: "4",
    name: "David Kim",
    role: "Software Engineer",
    startDate: "Sep 1, 2025",
    status: "Active",
    progress: 100,
  },
];

export default function PeopleView() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-text-primary mb-6">People</h1>

        {/* Search and Actions Bar */}
        <div className="flex items-center gap-4 mb-6">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary"
              size={20}
            />
            <input
              type="text"
              placeholder="Search people..."
              className="w-full bg-background-elevated text-text-primary placeholder-text-secondary pl-12 pr-4 py-3 rounded-lg border border-transparent focus:border-primary focus:outline-none"
            />
          </div>

          {/* Filter Button */}
          <button className="flex items-center gap-2 px-4 py-3 bg-background-elevated text-text-secondary hover:text-text-primary rounded-lg transition-colors">
            <Filter size={20} />
            <span className="font-medium">Filter</span>
          </button>

          {/* Add New User Button */}
          <button className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:opacity-90 transition-opacity">
            <Plus size={20} />
            <span>Add New User</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-background-elevated rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-4">
                Name
              </th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-4">
                Role
              </th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-4">
                Start Date
              </th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-4">
                Status
              </th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-4">
                Progress
              </th>
            </tr>
          </thead>
          <tbody>
            {mockEmployees.map((employee) => (
              <tr
                key={employee.id}
                className="border-b border-border last:border-b-0 hover:bg-background-primary transition-colors"
              >
                {/* Name */}
                <td className="px-6 py-4">
                  <span className="text-text-primary font-medium">{employee.name}</span>
                </td>

                {/* Role */}
                <td className="px-6 py-4">
                  <span className="text-text-secondary">{employee.role}</span>
                </td>

                {/* Start Date */}
                <td className="px-6 py-4">
                  <span className="text-text-secondary">{employee.startDate}</span>
                </td>

                {/* Status Badge */}
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                      employee.status === "Onboarding"
                        ? "bg-status-warning/20 text-status-warning"
                        : "bg-status-success/20 text-status-success"
                    }`}
                  >
                    {employee.status}
                  </span>
                </td>

                {/* Progress */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {/* Progress Bar */}
                    <div className="flex-1 h-2 bg-background-primary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${employee.progress}%` }}
                      />
                    </div>
                    {/* Percentage */}
                    <span className="text-text-secondary text-sm font-medium w-12 text-right">
                      {employee.progress}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
