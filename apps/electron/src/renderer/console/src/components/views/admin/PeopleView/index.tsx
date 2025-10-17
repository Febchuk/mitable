import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useUsers } from "@/console/src/hooks/queries/admin";

export default function PeopleView() {
  const navigate = useNavigate();
  const { data: users = [], isLoading: loading, error } = useUsers();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter users based on search query
  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-text-primary">People</h1>

        {/* Search and Actions Bar */}
        <div className="flex items-center gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
              size={20}
            />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
            />
          </div>

          {/* Filter Button */}
          <Button
            variant="outline"
            className="gap-2 bg-background-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-background-elevated/80"
          >
            <Filter size={20} />
            <span className="font-medium">Filter</span>
          </Button>

          {/* Add New User Button */}
          <Button
            className="gap-2 bg-primary text-white hover:bg-primary/90"
            onClick={() => navigate("/people/new")}
          >
            <Plus size={20} />
            <span>Add New User</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-background-primary/50 bg-background-secondary border-border-subtle">
              <TableHead className="text-text-secondary uppercase tracking-wider font-semibold text-xs">
                Name
              </TableHead>
              <TableHead className="text-text-secondary uppercase tracking-wider font-semibold text-xs">
                Role
              </TableHead>
              <TableHead className="text-text-secondary uppercase tracking-wider font-semibold text-xs">
                Start Date
              </TableHead>
              <TableHead className="text-text-secondary uppercase tracking-wider font-semibold text-xs">
                Status
              </TableHead>
              <TableHead className="text-text-secondary uppercase tracking-wider font-semibold text-xs">
                Progress
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-secondary py-8">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-status-error py-8">
                  Error: {error}
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-secondary py-8">
                  {searchQuery ? `No people found matching "${searchQuery}"` : "No users found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((employee) => (
                <TableRow
                  key={employee.id}
                  className="border-border-subtle hover:bg-background-primary/50 cursor-pointer"
                  onClick={() => navigate(`/people/${employee.id}`)}
                >
                  <TableCell className="font-medium text-text-primary">{employee.name}</TableCell>
                  <TableCell className="text-text-secondary">{employee.role}</TableCell>
                  <TableCell className="text-text-secondary">{employee.startDate}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        employee.status === "Onboarding"
                          ? "bg-status-warning/20 text-status-warning border-transparent hover:bg-status-warning/20"
                          : "bg-status-success/20 text-status-success border-transparent hover:bg-status-success/20"
                      }
                    >
                      {employee.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress value={employee.progress} className="flex-1 h-2 bg-border-subtle" />
                      <span className="text-text-secondary text-sm font-medium w-12 text-right">
                        {employee.progress}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
