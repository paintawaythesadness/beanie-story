import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, getNode, getRecent, login, logout, saveNode } from "./lib/api";
import { clearDraft, clearSession, loadDraft, loadSession, saveDraft, saveSession } from "./lib/storage";
import { isValidNodeId, normalizeNodeId } from "./lib/nodeId";
import { NODE_STATUSES, type NodeStatus, type StoryNode } from "./types";

type EditableNode = Pick<StoryNode, "id" | "title" | "status" | "content">;

const emptyNode = (id = ""): EditableNode => ({
  id,
  title: "",
  status: "default",
  content: "",
});

function serializeNode(node: EditableNode) {
  return JSON.stringify(node);
}

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [lookupId, setLookupId] = useState("");
  const [currentNode, setCurrentNode] = useState<EditableNode>(emptyNode());
  const [lastSavedAt, setLastSavedAt] = useState<string>("");
  const [recentNodes, setRecentNodes] = useState<StoryNode[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoadingNode, setIsLoadingNode] = useState(false);
  const [isSavingNode, setIsSavingNode] = useState(false);

  const savedSnapshot = useRef<string>(serializeNode(emptyNode()));

  const hasSession = Boolean(token);
  const normalizedLookupId = normalizeNodeId(lookupId);
  const normalizedCurrentId = normalizeNodeId(currentNode.id);
  const hasUnsavedChanges = useMemo(
    () => serializeNode(currentNode) !== savedSnapshot.current,
    [currentNode],
  );

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    setToken(session.token);
    setSessionExpiry(session.expiresAt);
  }, []);

  useEffect(() => {
    if (!token) return;
    void refreshRecent(token);
  }, [token]);

  useEffect(() => {
    if (!currentNode.id) return;
    saveDraft(currentNode);
  }, [currentNode]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  async function refreshRecent(activeToken: string) {
    try {
      const response = await getRecent(activeToken);
      setRecentNodes(response.nodes);
    } catch (error) {
      if (error instanceof Error && /unauthorized/i.test(error.message)) {
        handleSessionExpired();
      }
    }
  }

  function handleSessionExpired() {
    clearSession();
    setToken(null);
    setSessionExpiry(null);
    setRecentNodes([]);
    setStatusMessage("");
    setErrorMessage("Your session expired. Please sign in again.");
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setIsLoggingIn(true);
    setAuthError("");
    setErrorMessage("");

    try {
      const session = await login(password);
      saveSession(session.token, session.expiresAt);
      setToken(session.token);
      setSessionExpiry(session.expiresAt);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    if (token) {
      try {
        await logout(token);
      } catch {
        // Client-side logout is enough for this MVP.
      }
    }

    clearSession();
    setToken(null);
    setSessionExpiry(null);
    setCurrentNode(emptyNode());
    setRecentNodes([]);
    setLookupId("");
    setStatusMessage("");
    setErrorMessage("");
    savedSnapshot.current = serializeNode(emptyNode());
  }

  async function openNode(nodeIdInput: string) {
    const normalizedId = normalizeNodeId(nodeIdInput);
    if (!token) return;

    if (!isValidNodeId(normalizedId)) {
      setErrorMessage("Use letters, numbers, dashes, or underscores for the node ID.");
      return;
    }

    setIsLoadingNode(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const node = await getNode(token, normalizedId);
      const draft = loadDraft(normalizedId);
      const editableNode = draft
        ? { ...node, ...draft, id: normalizedId }
        : {
            id: node.id,
            title: node.title,
            status: node.status,
            content: node.content,
          };

      setLookupId(normalizedId);
      setCurrentNode(editableNode);
      savedSnapshot.current = serializeNode({
        id: node.id,
        title: node.title,
        status: node.status,
        content: node.content,
      });
      setLastSavedAt(node.updatedAt);
      setStatusMessage(draft ? "Loaded saved node and restored your local draft." : "Node loaded.");
    } catch (error) {
      if (error instanceof Error && /unauthorized/i.test(error.message)) {
        handleSessionExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Unable to load node");
    } finally {
      setIsLoadingNode(false);
    }
  }

  async function handleSave() {
    if (!token) return;

    const normalizedId = normalizeNodeId(currentNode.id);
    if (!isValidNodeId(normalizedId)) {
      setErrorMessage("Enter a valid node ID before saving.");
      return;
    }

    setIsSavingNode(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const saved = await saveNode(token, {
        id: normalizedId,
        title: currentNode.title.trim(),
        status: currentNode.status,
        content: currentNode.content,
      });

      const savedEditableNode: EditableNode = {
        id: saved.id,
        title: saved.title,
        status: saved.status,
        content: saved.content,
      };

      setCurrentNode(savedEditableNode);
      setLookupId(saved.id);
      setLastSavedAt(saved.updatedAt);
      setStatusMessage("Saved.");
      savedSnapshot.current = serializeNode(savedEditableNode);
      clearDraft(saved.id);
      void refreshRecent(token);
    } catch (error) {
      if (error instanceof Error && /unauthorized/i.test(error.message)) {
        handleSessionExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Unable to save node");
    } finally {
      setIsSavingNode(false);
    }
  }

  async function handleCopyNodeId() {
    if (!normalizedCurrentId) return;
    try {
      await navigator.clipboard.writeText(normalizedCurrentId);
      setStatusMessage("Node ID copied.");
    } catch {
      setStatusMessage("Copy failed on this device.");
    }
  }

  if (!hasSession) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <p className="eyebrow">Private mobile editor</p>
            <h1>Beanie Editor</h1>
            <p>Edit one story node at a time without wrestling a huge `.twee` file.</p>
            <p className="helper">API: {API_BASE}</p>
          </div>

          <form className="stack" onSubmit={handleLogin}>
            <label className="field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                inputMode="text"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter editor password"
              />
            </label>

            {authError ? <p className="message error">{authError}</p> : null}

            <button className="primary-button" disabled={isLoggingIn || !password.trim()} type="submit">
              {isLoggingIn ? "Signing in..." : "Open editor"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Beanie Editor</p>
          <h1>Story node editor</h1>
          <p className="helper">
            {sessionExpiry ? `Session ends ${new Date(sessionExpiry).toLocaleString()}` : "Signed in"}
          </p>
        </div>

        <button className="ghost-button" onClick={handleLogout} type="button">
          Log out
        </button>
      </header>

      <section className="panel stack">
        <div className="section-header">
          <h2>Open node</h2>
          <p>Search by node ID, for example `S3B2`.</p>
        </div>

        <div className="open-row">
          <input
            aria-label="Node ID"
            className="large-input"
            inputMode="text"
            placeholder="Node ID"
            value={lookupId}
            onChange={(event) => setLookupId(normalizeNodeId(event.target.value))}
          />
          <button
            className="primary-button"
            disabled={isLoadingNode || !isValidNodeId(normalizedLookupId)}
            onClick={() => void openNode(lookupId)}
            type="button"
          >
            {isLoadingNode ? "Opening..." : "Open"}
          </button>
        </div>

        <div className="recent-list">
          <div className="section-header compact">
            <h3>Recent nodes</h3>
          </div>

          {recentNodes.length === 0 ? (
            <p className="helper">No recent nodes yet.</p>
          ) : (
            recentNodes.map((node) => (
              <button
                key={node.id}
                className="recent-chip"
                onClick={() => void openNode(node.id)}
                type="button"
              >
                <span>{node.id}</span>
                <small>{node.status.replace("_", " ")}</small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel stack">
        <div className="section-header">
          <h2>Node details</h2>
          <p>Make quick edits comfortably on a phone or tablet.</p>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>ID</span>
            <input
              inputMode="text"
              placeholder="S3B2"
              value={currentNode.id}
              onChange={(event) =>
                setCurrentNode((node) => ({ ...node, id: normalizeNodeId(event.target.value) }))
              }
            />
          </label>

          <button
            className="ghost-button"
            disabled={!normalizedCurrentId}
            onClick={() => void handleCopyNodeId()}
            type="button"
          >
            Copy ID
          </button>

          <label className="field field-full">
            <span>Title / label</span>
            <input
              placeholder="Optional title"
              value={currentNode.title}
              onChange={(event) => setCurrentNode((node) => ({ ...node, title: event.target.value }))}
            />
          </label>

          <label className="field field-full">
            <span>Status</span>
            <select
              value={currentNode.status}
              onChange={(event) =>
                setCurrentNode((node) => ({ ...node, status: event.target.value as NodeStatus }))
              }
            >
              {NODE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field field-full">
          <span>Content</span>
          <textarea
            placeholder="Write the node text here..."
            rows={16}
            value={currentNode.content}
            onChange={(event) => setCurrentNode((node) => ({ ...node, content: event.target.value }))}
          />
        </label>

        <div className="status-row">
          <div>
            {lastSavedAt ? (
              <p className="helper">Last saved {new Date(lastSavedAt).toLocaleString()}</p>
            ) : (
              <p className="helper">This node has not been saved yet.</p>
            )}
            <p className="helper">{hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}</p>
          </div>

          <button
            className="primary-button"
            disabled={isSavingNode || !isValidNodeId(normalizedCurrentId)}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSavingNode ? "Saving..." : "Save node"}
          </button>
        </div>

        {statusMessage ? <p className="message success">{statusMessage}</p> : null}
        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
