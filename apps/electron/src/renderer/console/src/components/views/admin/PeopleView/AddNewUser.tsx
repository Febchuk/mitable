import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clipboard, X, UserPlus, Shield, Mail } from "lucide-react";
import { createLogger } from "../../../../../../lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateUser } from "@/console/src/hooks/queries/admin";
import { useToast } from "@/hooks/use-toast";

const logger = createLogger("AddNewUser");

function Field({
  label,
  required = false,
  value,
  onChange,
  placeholder,
  type = "text",
  helpText,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  helpText?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
        {required ? <span style={{ color: "var(--status-error)" }}> *</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          height: 40,
          padding: "0 12px",
          borderRadius: 8,
          border: "var(--border-subtle)",
          background: "var(--bg-base)",
          color: "var(--text-primary)",
          fontSize: 13,
          outline: "none",
        }}
      />
      {helpText ? (
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
          {helpText}
        </p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 10,
        border: checked
          ? "0.5px solid rgba(var(--mi-accent-rgb, 130,192,204), 0.25)"
          : "var(--border-subtle)",
        background: checked ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.05)" : "var(--bg-base)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: checked
            ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.14)"
            : "rgba(var(--ui-rgb), 0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: checked ? "var(--mi-accent)" : "var(--text-tertiary)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5 }}>
          {description}
        </div>
      </div>

      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: checked ? "5px solid var(--mi-accent)" : "1px solid rgba(var(--ui-rgb), 0.18)",
          background: checked ? "var(--bg-base)" : "transparent",
          marginTop: 4,
          flexShrink: 0,
        }}
      />
    </button>
  );
}

export default function AddNewUser() {
  const navigate = useNavigate();
  const createUserMutation = useCreateUser();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [welcomeEmail, setWelcomeEmail] = useState(true);
  const [makeAdmin, setMakeAdmin] = useState(false);

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

      setGeneratedPassword(response.initialPassword);
      setShowPasswordModal(true);
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
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-md border-border-subtle bg-background-elevated">
          <button
            onClick={handleClosePasswordModal}
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>

          <DialogHeader>
            <DialogTitle className="text-2xl text-text-primary">
              User created successfully
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Save this password and send it to the new user. This password will not be shown again.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "rgba(212, 162, 122, 0.08)",
                border: "0.5px solid rgba(212, 162, 122, 0.18)",
                borderRadius: 10,
                padding: 14,
              }}
            >
              <p
                style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}
              >
                <strong style={{ color: "var(--text-primary)" }}>Important:</strong> Mitable does
                not save passwords. Make sure to save this somewhere secure before closing this
                window.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)" }}>
                Generated password
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  value={generatedPassword}
                  readOnly
                  style={{
                    flex: 1,
                    height: 40,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "var(--border-subtle)",
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleCopyPassword}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    border: "var(--border-subtle)",
                    background: "var(--bg-base)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Clipboard className="h-4 w-4" />
                </button>
              </div>
              {passwordCopied ? (
                <p style={{ fontSize: 12, color: "#2F7D5A", margin: 0 }}>
                  Password copied to clipboard
                </p>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={handleClosePasswordModal}
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "var(--bg-overlay)",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={() => navigate("/people")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              width: "fit-content",
              padding: 0,
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={15} />
            Back to People
          </button>

          <div>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 26,
                color: "var(--text-primary)",
                fontWeight: 400,
                letterSpacing: "-0.3px",
                margin: 0,
              }}
            >
              Add user
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
              Invite a new teammate and configure their access before they sign in.
            </p>
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              paddingBottom: 16,
              borderBottom: "var(--border-hairline)",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
              User details
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
              Basic information for the new teammate.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field
              label="First name"
              required
              value={firstName}
              onChange={setFirstName}
              placeholder="Enter first name"
            />
            <Field
              label="Last name"
              required
              value={lastName}
              onChange={setLastName}
              placeholder="Enter last name"
            />
            <div style={{ gridColumn: "1 / -1" }}>
              <Field
                label="Email address"
                required
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="email@example.com"
                helpText="This is where the user will receive their credentials."
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field
                label="Job title"
                required
                value={jobTitle}
                onChange={setJobTitle}
                placeholder="e.g. Software Engineer, Product Designer"
              />
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              paddingBottom: 16,
              borderBottom: "var(--border-hairline)",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
              Access and onboarding
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
              Choose how this user should be introduced to the workspace.
            </p>
          </div>

          <ToggleRow
            icon={<Mail size={14} />}
            title="Send welcome email"
            description="Email the user their login credentials and a prompt to get started."
            checked={welcomeEmail}
            onChange={setWelcomeEmail}
          />

          <ToggleRow
            icon={<Shield size={14} />}
            title="Make user an admin"
            description="Admins can manage integrations, view team analytics, and create reports."
            checked={makeAdmin}
            onChange={setMakeAdmin}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-tertiary)",
            }}
          >
            <UserPlus size={13} />A password will be generated automatically after creation.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => navigate("/people")}
              disabled={createUserMutation.isPending}
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: createUserMutation.isPending ? "default" : "pointer",
                opacity: createUserMutation.isPending ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createUserMutation.isPending}
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 8,
                border: "0.5px solid var(--mi-accent-border)",
                background: "var(--mi-accent-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: createUserMutation.isPending ? "default" : "pointer",
                opacity: createUserMutation.isPending ? 0.6 : 1,
              }}
            >
              {createUserMutation.isPending ? "Creating..." : "Create user"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
