import { useState, useEffect } from "react";
import { Search, Plus, Users, Star } from "lucide-react";
import { useDebounce } from "@/console/src/hooks/useDebounce";
import { searchExperts, searchUsers, Expert, User } from "@/console/src/services/nudgesService";
import Avatar from "@/console/src/components/ui/Avatar";
import Button from "@/console/src/components/ui/Button";

interface PeopleSelectorProps {
  selectedPeople: Array<{ id: string; name: string; role: string }>;
  onAddPerson: (person: { id: string; name: string; role: string }) => void;
}

type TabType = "experts" | "users";

export default function PeopleSelector({ selectedPeople, onAddPerson }: PeopleSelectorProps) {
  const [activeTab, setActiveTab] = useState<TabType>("experts");
  const [searchQuery, setSearchQuery] = useState("");
  const [experts, setExperts] = useState<Expert[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setExperts([]);
      setUsers([]);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      setError(null);

      try {
        if (activeTab === "experts") {
          const response = await searchExperts(debouncedQuery);
          setExperts(response.experts);
        } else {
          const response = await searchUsers(debouncedQuery);
          setUsers(response.users);
        }
      } catch (err) {
        console.error("Error searching:", err);
        setError("Failed to search. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [debouncedQuery, activeTab]);

  // Clear results when switching tabs
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setExperts([]);
    setUsers([]);
  };

  const isPersonSelected = (personId: string) => {
    return selectedPeople.some((p) => p.id === personId);
  };

  const handleAddExpert = (expert: Expert) => {
    onAddPerson({
      id: expert.id,
      name: expert.name,
      role: expert.role,
    });
  };

  const handleAddUser = (user: User) => {
    onAddPerson({
      id: user.id,
      name: user.name,
      role: user.role,
    });
  };

  const currentResults = activeTab === "experts" ? experts : users;
  const showEmptyState = !loading && debouncedQuery.trim() && currentResults.length === 0;
  const showInitialState = !loading && !debouncedQuery.trim();

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex gap-2 bg-background-secondary p-1 rounded-lg">
        <button
          onClick={() => handleTabChange("experts")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "experts"
              ? "bg-background-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Star size={16} />
            <span>Experts</span>
          </div>
        </button>
        <button
          onClick={() => handleTabChange("users")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "users"
              ? "bg-background-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Users size={16} />
            <span>All Users</span>
          </div>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeTab === "experts" ? "experts" : "users"}...`}
          className="w-full pl-10 pr-4 py-3 bg-background-secondary text-text-primary placeholder-text-tertiary rounded-lg border border-border-subtle outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
      </div>

      {/* Results Container */}
      <div className="max-h-[300px] overflow-y-auto space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-sm text-status-error">{error}</p>
          </div>
        )}

        {showInitialState && (
          <div className="text-center py-8">
            <Search size={32} className="mx-auto mb-2 text-text-tertiary" />
            <p className="text-sm text-text-secondary">
              Start typing to search for {activeTab === "experts" ? "experts" : "people"}
            </p>
          </div>
        )}

        {showEmptyState && (
          <div className="text-center py-8">
            <p className="text-sm text-text-secondary">No results found</p>
            <p className="text-xs text-text-tertiary mt-1">Try a different search term</p>
          </div>
        )}

        {!loading &&
          activeTab === "experts" &&
          experts.map((expert) => (
            <div
              key={expert.id}
              className="flex items-start gap-3 p-3 bg-background-secondary rounded-lg border border-border-subtle hover:border-border transition-colors"
            >
              <Avatar name={expert.name} imageUrl={expert.avatar || undefined} size="md" />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {expert.name}
                    </p>
                    <p className="text-xs text-text-secondary">{expert.role}</p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAddExpert(expert)}
                    disabled={isPersonSelected(expert.id)}
                    className="shrink-0"
                  >
                    {isPersonSelected(expert.id) ? (
                      "Added"
                    ) : (
                      <>
                        <Plus size={14} className="mr-1" />
                        Add
                      </>
                    )}
                  </Button>
                </div>

                {expert.expertiseSummary && (
                  <p className="text-xs text-text-tertiary mb-2 line-clamp-2">
                    {expert.expertiseSummary}
                  </p>
                )}

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>{expert.responseRate}% response rate</span>
                  <span>•</span>
                  <span>{expert.helpfulnessScore.toFixed(1)}/5 rating</span>
                </div>
              </div>
            </div>
          ))}

        {!loading &&
          activeTab === "users" &&
          users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg border border-border-subtle hover:border-border transition-colors"
            >
              <Avatar name={user.name} imageUrl={user.avatar || undefined} size="md" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
                <p className="text-xs text-text-secondary">{user.role}</p>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => handleAddUser(user)}
                disabled={isPersonSelected(user.id)}
              >
                {isPersonSelected(user.id) ? (
                  "Added"
                ) : (
                  <>
                    <Plus size={14} className="mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
          ))}
      </div>

      <p className="text-xs text-text-tertiary">
        {activeTab === "experts"
          ? "Experts are ranked by expertise match, response rate, and helpfulness"
          : "Search by name, email, or role"}
      </p>
    </div>
  );
}
