import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("AddNewUser");
import { ArrowLeft, Clipboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateUser } from "@/console/src/hooks/queries/admin";
import { useToast } from "@/hooks/use-toast";

export default function AddNewUser() {
  const navigate = useNavigate();
  const createUserMutation = useCreateUser();
  const { toast } = useToast();

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [welcomeEmail, setWelcomeEmail] = useState(true);
  const [makeAdmin, setMakeAdmin] = useState(false);

  // Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (error) {
      logger.error("Failed to copy password:", error);
      toast({
        title: "Error",
        description: "Failed to copy password to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordCopied(false);
    navigate("/people");
  };

  const handleSubmit = async () => {
    // Validation
    if (!firstName || !lastName) {
      toast({
        title: "Error",
        description: "Please enter first and last name",
        variant: "destructive",
      });
      return;
    }

    if (!email) {
      toast({
        title: "Error",
        description: "Please enter email address",
        variant: "destructive",
      });
      return;
    }

    if (!jobTitle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a job title",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await createUserMutation.mutateAsync({
        firstName,
        lastName,
        email,
        role: jobTitle.trim(),
        sendWelcomeEmail: welcomeEmail,
        makeAdmin,
      });

      // Show password modal with generated password
      setGeneratedPassword(response.initialPassword);
      setShowPasswordModal(true);

      // React Query auto-invalidates the users list via useCreateUser hook
    } catch (error) {
      logger.error("Error creating user:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-md bg-background-elevated border-border-subtle">
          <button
            onClick={handleClosePasswordModal}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>

          <DialogHeader>
            <DialogTitle className="text-2xl text-text-primary">
              User Created Successfully
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Save this password and send it to the new user. This password will not be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warning Box */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <p className="text-sm text-text-secondary">
                <strong className="text-text-primary">Important:</strong> Mitable does not save
                passwords. Make sure to save this password somewhere secure before closing this
                window.
              </p>
            </div>

            {/* Password Display */}
            <div className="space-y-2">
              <Label className="text-text-primary">Generated Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={generatedPassword}
                  readOnly
                  className="bg-background-secondary border-border-subtle text-text-primary font-mono"
                />
                <Button
                  onClick={handleCopyPassword}
                  variant="outline"
                  size="icon"
                  className="shrink-0 bg-background-secondary border-border-subtle hover:bg-background-elevated"
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
              </div>
              {passwordCopied && (
                <p className="text-xs text-green-500">Password copied to clipboard!</p>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button
              onClick={handleClosePasswordModal}
              className="bg-primary text-white hover:bg-primary/90"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <button
            onClick={() => navigate("/people")}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Back to People</span>
          </button>
          <h1 className="text-4xl font-bold text-text-primary">Add New User</h1>
        </div>

        {/* User Info Section */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-text-primary">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
                className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
              />
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-text-primary">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
                className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
              />
            </div>

            {/* Email */}
            <div className="space-y-2 col-span-2">
              <Label htmlFor="email" className="text-text-primary">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
              />
              <p className="text-xs text-text-secondary">
                User will receive login credentials at this email
              </p>
            </div>

            {/* Job Title */}
            <div className="space-y-2 col-span-2">
              <Label htmlFor="jobTitle" className="text-text-primary">
                Job Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer, Product Designer, Marketing Manager"
                className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
              />
            </div>
          </div>
        </div>

        {/* Settings Section */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="space-y-4">
            {/* Welcome Email */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="welcomeEmail"
                checked={welcomeEmail}
                onCheckedChange={(checked) => setWelcomeEmail(checked as boolean)}
              />
              <div className="flex-1">
                <Label
                  htmlFor="welcomeEmail"
                  className="text-text-primary font-medium cursor-pointer"
                >
                  Send welcome email
                </Label>
                <p className="text-sm text-text-secondary mt-1">Email includes login credentials</p>
              </div>
            </div>

            {/* Make User an Admin */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="makeAdmin"
                checked={makeAdmin}
                onCheckedChange={(checked) => setMakeAdmin(checked as boolean)}
              />
              <div className="flex-1">
                <Label htmlFor="makeAdmin" className="text-text-primary font-medium cursor-pointer">
                  Make user an admin
                </Label>
                <p className="text-sm text-text-secondary mt-1">
                  Admins can manage integrations and view team analytics.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => navigate("/people")}
            disabled={createUserMutation.isPending}
            className="bg-transparent border-border-subtle text-text-primary hover:bg-background-elevated"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createUserMutation.isPending}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {createUserMutation.isPending ? "Creating..." : "+ Add User"}
          </Button>
        </div>
      </div>
    </>
  );
}
