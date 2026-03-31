import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, getAllNodes, getNode, getRecent, login, logout, saveNode } from "./lib/api";
import { clearDraft, clearSession, loadDraft, loadSession, saveDraft, saveSession } from "./lib/storage";
import { isValidNodeId, normalizeNodeId } from "./lib/nodeId";
import { extractTwineLinkTargets } from "./lib/twineLinks";
import type { StoryNode } from "./types";

type EditableNode = Pick<StoryNode, "id" | "name" | "displayTitle" | "content" | "meta" | "modifiedAt">;

const emptyNode = (id = ""): EditableNode => ({
  id,
  name: id,
  displayTitle: "",
  content: "",
  meta: {},
  modifiedAt: "",
});

function serializeEditorState(node: EditableNode, metaValue: string) {
  return JSON.stringify({
    ...node,
    metaText: metaValue,
  });
}

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [lookupId, setLookupId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentNode, setCurrentNode] = useState<EditableNode>(emptyNode());
  const [lastSavedAt, setLastSavedAt] = useState<string>("");
  const [recentNodes, setRecentNodes] = useState<StoryNode[]>([]);
  const [allNodes, setAllNodes] = useState<Array<Pick<StoryNode, "id" | "name" | "displayTitle">>>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [metaText, setMetaText] = useState("{}");
  const [isLoadingNode, setIsLoadingNode] = useState(false);
  const [isSavingNode, setIsSavingNode] = useState(false);
  const [isLoadingSearchIndex, setIsLoadingSearchIndex] = useState(false);

  const savedSnapshot = useRef<string>(serializeEditorState(emptyNode(), "{}"));

  const hasSession = Boolean(token);
  const normalizedLookupId = normalizeNodeId(lookupId);
  const normalizedCurrentId = normalizeNodeId(currentNode.id);
  const linkedNodes = useMemo(() => extractTwineLinkTargets(currentNode.content), [currentNode.content]);
  const searchResults = useMemo(() => rankNodeMatches(allNodes, searchQuery), [allNodes, searchQuery]);
  const hasUnsavedChanges = useMemo(
    () => serializeEditorState(currentNode, metaText) !== savedSnapshot.current,
    [currentNode, metaText],
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
    void refreshSearchIndex(token);
  }, [token]);

  useEffect(() => {
    if (!currentNode.id) return;
    const draftMeta = tryParseMeta(metaText) ?? currentNode.meta;
    saveDraft({ ...currentNode, meta: draftMeta });
  }, [currentNode, metaText]);

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

  async function refreshSearchIndex(activeToken: string) {
    setIsLoadingSearchIndex(true);

    try {
      const nodes = await getAllNodes(activeToken);
      setAllNodes(nodes.map((node) => ({ id: node.id, name: node.name, displayTitle: node.displayTitle })));
    } catch (error) {
      if (error instanceof Error && /unauthorized/i.test(error.message)) {
        handleSessionExpired();
      }
    } finally {
      setIsLoadingSearchIndex(false);
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
    setAllNodes([]);
    setRecentNodes([]);
    setLookupId("");
    setSearchQuery("");
    setMetaText("{}");
    setStatusMessage("");
    setErrorMessage("");
    savedSnapshot.current = serializeEditorState(emptyNode(), "{}");
  }

  async function openNode(nodeIdInput: string) {
    const normalizedId = normalizeNodeId(nodeIdInput);
    if (!token) return;

    if (!isValidNodeId(normalizedId)) {
      setErrorMessage("Enter a non-empty passage ID.");
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
            name: node.name,
            displayTitle: node.displayTitle || "",
            content: node.content,
            meta: node.meta,
            modifiedAt: node.modifiedAt || "",
          };

      setLookupId(normalizedId);
      setSearchQuery("");
      setCurrentNode(editableNode);
      setMetaText(formatMeta(editableNode.meta));
      savedSnapshot.current = serializeEditorState({
        id: node.id,
        name: node.name,
        displayTitle: node.displayTitle || "",
        content: node.content,
        meta: node.meta,
        modifiedAt: node.modifiedAt || "",
      }, formatMeta(node.meta));
      setLastSavedAt(node.modifiedAt || "");
      setStatusMessage(draft ? "Loaded saved passage and restored your local draft." : "Passage loaded.");
    } catch (error) {
      if (error instanceof Error && /unauthorized/i.test(error.message)) {
        handleSessionExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Unable to load passage");
    } finally {
      setIsLoadingNode(false);
    }
  }

  function requestOpenNode(nodeIdInput: string) {
    const normalizedId = normalizeNodeId(nodeIdInput);
    if (!normalizedId) {
      return;
    }

    if (hasUnsavedChanges && normalizedId !== normalizedCurrentId) {
      const shouldContinue = window.confirm("You have unsaved changes. Open another passage anyway?");
      if (!shouldContinue) {
        return;
      }
    }

    void openNode(nodeIdInput);
  }

  async function handleSave() {
    if (!token) return;

    const normalizedId = normalizeNodeId(currentNode.id);
    if (!isValidNodeId(normalizedId)) {
      setErrorMessage("Enter a non-empty passage ID before saving.");
      return;
    }

    let parsedMeta: Record<string, unknown>;
    try {
      parsedMeta = parseMeta(metaText);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Meta must be valid JSON.");
      return;
    }

    setIsSavingNode(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const saved = await saveNode(token, {
        id: normalizedId,
        name: currentNode.name.trim(),
        displayTitle: (currentNode.displayTitle || "").trim() || undefined,
        content: currentNode.content,
        meta: parsedMeta,
        modifiedAt: currentNode.modifiedAt || undefined,
      });

      const savedEditableNode: EditableNode = {
        id: saved.id,
        name: saved.name,
        displayTitle: saved.displayTitle || "",
        content: saved.content,
        meta: saved.meta,
        modifiedAt: saved.modifiedAt || "",
      };

      setCurrentNode(savedEditableNode);
      setMetaText(formatMeta(saved.meta));
      setLookupId(saved.id);
      setLastSavedAt(saved.modifiedAt || "");
      setStatusMessage("Saved.");
      savedSnapshot.current = serializeEditorState(savedEditableNode, formatMeta(saved.meta));
      clearDraft(saved.id);
      void refreshRecent(token);
      void refreshSearchIndex(token);
    } catch (error) {
      if (error instanceof Error && /unauthorized/i.test(error.message)) {
        handleSessionExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Unable to save passage");
    } finally {
      setIsSavingNode(false);
    }
  }

  async function handleCopyNodeId() {
    if (!normalizedCurrentId) return;
    try {
      await navigator.clipboard.writeText(normalizedCurrentId);
      setStatusMessage("Passage ID copied.");
    } catch {
      setStatusMessage("Copy failed on this device.");
    }
  }

  function handleClearPassage() {
    const nextNode = emptyNode();
    setCurrentNode(nextNode);
    setLookupId("");
    setSearchQuery("");
    setMetaText("{}");
    setLastSavedAt("");
    setStatusMessage("Editor cleared.");
    setErrorMessage("");
    savedSnapshot.current = serializeEditorState(nextNode, "{}");
  }

  if (!hasSession) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <p className="eyebrow">Private mobile editor</p>
            <h1>Beanie Editor</h1>
            <p>Edit one story passage record at a time without wrestling a huge `.twee` file.</p>
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
          <h1>Story passage editor</h1>
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
          <h2>Open passage</h2>
          <p>Open by exact ID or search passage names by partial match.</p>
        </div>

        <label className="field field-full">
          <span>Search passage names</span>
          <input
            aria-label="Search passage names"
            placeholder="Type part of a title, for example teens or pickle"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        {searchQuery.trim() ? (
          <div className="search-results">
            {searchResults.length === 0 ? (
              <p className="helper">No passage names matched.</p>
            ) : (
              searchResults.map((node) => (
                <button
                  key={node.id}
                  className="search-chip"
                  onClick={() => requestOpenNode(node.id)}
                  type="button"
                >
                  <span>{node.displayTitle || node.name}</span>
                  <small>{node.id}</small>
                </button>
              ))
            )}
          </div>
        ) : (
          <p className="helper">{isLoadingSearchIndex ? "Loading passage names..." : "Search is ready."}</p>
        )}

        <div className="open-row">
          <input
            aria-label="Passage ID"
            className="large-input"
            inputMode="text"
            placeholder="Passage ID"
            value={lookupId}
            onChange={(event) => setLookupId(event.target.value)}
          />
          <button
            className="primary-button"
            disabled={isLoadingNode || !isValidNodeId(normalizedLookupId)}
            onClick={() => requestOpenNode(lookupId)}
            type="button"
          >
            {isLoadingNode ? "Opening..." : "Open"}
          </button>
        </div>

        <div className="recent-list">
          <div className="section-header compact">
            <h3>Recent passages</h3>
          </div>

          {recentNodes.length === 0 ? (
            <p className="helper">No recent passages yet.</p>
          ) : (
            recentNodes.map((node) => (
              <button
                key={node.id}
                className="recent-chip"
                onClick={() => requestOpenNode(node.id)}
                type="button"
              >
                <span>{node.displayTitle || node.name}</span>
                <small>{node.id}</small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel stack">
        <div className="section-header">
          <h2>Passage details</h2>
          <p>Make quick edits comfortably on a phone or tablet.</p>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>ID</span>
            <input
              inputMode="text"
              placeholder="Ask the teens what happened"
              value={currentNode.id}
              onChange={(event) =>
                setCurrentNode((node) => ({ ...node, id: event.target.value }))
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
            <span>Name</span>
            <input
              placeholder="Passage name"
              value={currentNode.name}
              onChange={(event) => setCurrentNode((node) => ({ ...node, name: event.target.value }))}
            />
          </label>

          <label className="field field-full">
            <span>Display title</span>
            <input
              placeholder="Optional UI label"
              value={currentNode.displayTitle}
              onChange={(event) => setCurrentNode((node) => ({ ...node, displayTitle: event.target.value }))}
            />
          </label>
        </div>

        <label className="field field-full">
          <span>Content</span>
          <textarea
            placeholder="Write the passage text here..."
            rows={16}
            value={currentNode.content}
            onChange={(event) => setCurrentNode((node) => ({ ...node, content: event.target.value }))}
          />
        </label>

        <label className="field field-full">
          <span>Meta JSON</span>
          <textarea
            placeholder='{"editStatus":"default","position":"123,456","size":"100,100"}'
            rows={8}
            value={metaText}
            onChange={(event) => {
              setMetaText(event.target.value);
              setCurrentNode((node) => ({ ...node, meta: node.meta }));
            }}
          />
        </label>

        <div className="linked-panel">
          <div className="section-header compact">
            <h3>Linked nodes</h3>
            <p>Likely Twine targets found in this passage.</p>
          </div>

          {linkedNodes.length === 0 ? (
            <p className="helper">No Twine links detected in the current passage.</p>
          ) : (
            <div className="linked-list">
              {linkedNodes.map((link) => (
                <button
                  key={link.target}
                  className="linked-chip"
                  onClick={() => requestOpenNode(link.target)}
                  type="button"
                >
                  <span>{link.label ? `${link.label} → ${link.target}` : link.target}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="status-row">
          <div>
            {lastSavedAt ? (
              <p className="helper">Last saved {new Date(lastSavedAt).toLocaleString()}</p>
            ) : (
              <p className="helper">This passage has not been saved yet.</p>
            )}
            <p className="helper">{hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}</p>
          </div>

          <div className="open-row">
            <button className="ghost-button" onClick={handleClearPassage} type="button">
              Clear
            </button>
            <button
              className="primary-button"
              disabled={isSavingNode || !isValidNodeId(normalizedCurrentId)}
              onClick={() => void handleSave()}
              type="button"
            >
              {isSavingNode ? "Saving..." : "Save passage"}
            </button>
          </div>
        </div>

        {statusMessage ? <p className="message success">{statusMessage}</p> : null}
        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
      </section>
    </main>
  );
}

function parseMeta(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Meta must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function formatMeta(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function tryParseMeta(value: string): Record<string, unknown> | null {
  try {
    return parseMeta(value);
  } catch {
    return null;
  }
}

function rankNodeMatches(
  nodes: Array<Pick<StoryNode, "id" | "name" | "displayTitle">>,
  query: string,
): Array<Pick<StoryNode, "id" | "name" | "displayTitle">> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return [...nodes]
    .map((node) => ({
      node,
      score: scoreNodeMatch(node, normalizedQuery),
    }))
    .filter((entry): entry is { node: Pick<StoryNode, "id" | "name" | "displayTitle">; score: number } => entry.score !== null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const leftLabel = (left.node.displayTitle || left.node.name).toLowerCase();
      const rightLabel = (right.node.displayTitle || right.node.name).toLowerCase();
      if (leftLabel.length !== rightLabel.length) {
        return leftLabel.length - rightLabel.length;
      }

      return leftLabel.localeCompare(rightLabel);
    })
    .slice(0, 20)
    .map((entry) => entry.node);
}

function scoreNodeMatch(node: Pick<StoryNode, "id" | "name" | "displayTitle">, query: string): number | null {
  const fields = [node.displayTitle, node.name, node.id].filter((value): value is string => Boolean(value));
  let bestScore: number | null = null;

  for (const field of fields) {
    const normalizedField = field.toLowerCase();
    if (normalizedField === query) {
      bestScore = minScore(bestScore, 0);
      continue;
    }

    if (normalizedField.startsWith(query)) {
      bestScore = minScore(bestScore, 1);
      continue;
    }

    const wordIndex = normalizedField.indexOf(` ${query}`);
    if (wordIndex >= 0) {
      bestScore = minScore(bestScore, 2);
      continue;
    }

    if (normalizedField.includes(query)) {
      bestScore = minScore(bestScore, 3);
    }
  }

  return bestScore;
}

function minScore(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}
