import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef(null);

  const activeChat = conversations.find(
    (chat) => chat.id === activeChatId
  );

  const messages = activeChat?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  const createChat = () => {
    if (loading) return;

    const id = Date.now();

    const newChat = {
      id,
      title: "New HR Interview",
      messages: [],
    };

    setConversations((prev) => [newChat, ...prev].slice(0, 3));
    setActiveChatId(id);
    setQuestion("");
  };

  const selectChat = (id) => {
    if (loading) return;
    setActiveChatId(id);
    setQuestion("");
  };

  const deleteChat = (event, id) => {
    event.stopPropagation();

    setConversations((prev) => {
      const updated = prev.filter((chat) => chat.id !== id);

      if (id === activeChatId) {
        setActiveChatId(updated[0]?.id ?? null);
      }

      return updated;
    });
  };

  const updateChat = (chatId, updater) => {
    setConversations((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;

        return {
          ...chat,
          ...(typeof updater === "function"
            ? updater(chat)
            : updater),
        };
      })
    );
  };

  const updateChatMessages = (chatId, updater) => {
    setConversations((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;

        const nextMessages =
          typeof updater === "function"
            ? updater(chat.messages)
            : updater;

        return {
          ...chat,
          messages: nextMessages,
        };
      })
    );
  };

  const askQuestion = async (text = question) => {
    const userQuestion = text.trim();

    if (!userQuestion || loading) return;

    let chatId = activeChatId;

    // If HR asks a question before creating a chat,
    // create one automatically.
    if (!chatId) {
      chatId = Date.now();

      const newChat = {
        id: chatId,
        title: userQuestion,
        messages: [],
      };

      setConversations((prev) =>
        [newChat, ...prev].slice(0, 3)
      );

      setActiveChatId(chatId);
    } else {
      // Give an empty chat its first question as the title.
      setConversations((prev) =>
        prev.map((chat) =>
          chat.id === chatId && chat.messages.length === 0
            ? {
                ...chat,
                title: userQuestion,
              }
            : chat
        )
      );
    }

    const userMessage = {
      role: "user",
      content: userQuestion,
    };

    updateChatMessages(chatId, (prev) => [
      ...prev,
      userMessage,
      {
        role: "assistant",
        content: "",
      },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userQuestion,
        }),
      });

      if (!response.ok) {
        let errorMessage = `Backend returned ${response.status}`;

        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          }
        } catch {
          // Backend may not return JSON on errors.
        }

        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error(
          "Streaming is not supported by the backend response."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let fullAnswer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, {
          stream: true,
        });

        fullAnswer += chunk;

        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];

          updated[updated.length - 1] = {
            role: "assistant",
            content: fullAnswer,
          };

          return updated;
        });
      }

      const finalChunk = decoder.decode();

      if (finalChunk) {
        fullAnswer += finalChunk;

        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];

          updated[updated.length - 1] = {
            role: "assistant",
            content: fullAnswer,
          };

          return updated;
        });
      }
    } catch (error) {
      console.error("Backend error:", error);

      updateChatMessages(chatId, (prev) => {
        const updated = [...prev];

        updated[updated.length - 1] = {
          role: "assistant",
          content:
            `Sorry, I couldn't get an answer.\n\n` +
            `**Error:** ${error.message}`,
        };

        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const copyAnswer = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const exportChat = () => {
    if (!activeChat || messages.length === 0) return;

    const text = messages
      .map(
        (message) =>
          `${message.role === "user" ? "HR Recruiter" : "Candidate AI"}:\n${message.content}`
      )
      .join("\n\n");

    const blob = new Blob([text], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "hiremeai-interview.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const downloadResume = () => {
    window.open(`${API_URL}/download-resume`, "_blank");
  };

  const suggestions = [
    {
      title: "Technical Skills",
      description:
        "What are the candidate's core programming languages, frameworks or AI skills?",
      question: "What are the candidate's technical skills?",
    },
    {
      title: "Work Experience",
      description:
        "Tell me about the candidate's past roles, responsibilities and achievements.",
      question: "Tell me about the candidate's work experience.",
    },
    {
      title: "Why Hire Me?",
      description:
        "What key strengths make the candidate a great fit for our team?",
      question: "Why should we hire this candidate?",
    },
    {
      title: "Projects & Education",
      description:
        "What major software/AI projects has the candidate built?",
      question:
        "Tell me about the candidate's projects and education.",
    },
  ];

  return (
    <div className={`app ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="logo-section">
          <div className="logo-icon">S</div>

          <div className="logo-text">
            <div className="logo-title">Candidate AI</div>
            <div className="logo-subtitle">Shubham Yadav</div>
          </div>

          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            ‹
          </button>
        </div>

        <button
          className="new-chat"
          onClick={createChat}
          disabled={loading}
          type="button"
        >
          <span>＋</span>
          <span>New chat</span>
        </button>

        <div className="recent-title">AI TOOLS</div>

        <div className="tools-list">
          <button className="tool-item" type="button">
            Upload new resume
          </button>

          <button
            className="tool-item"
            type="button"
            onClick={() =>
              askQuestion(
                "Give me some important interview questions for this candidate."
              )
            }
          >
            Interview questions
          </button>

          <button
            className="tool-item"
            type="button"
            onClick={() =>
              askQuestion(
                "What is this candidate's job match score and why?"
              )
            }
          >
            Job match score
          </button>

          <button
            className="tool-item"
            type="button"
            onClick={() =>
              askQuestion("Why should we hire this candidate?")
            }
          >
            Why hire this candidate?
          </button>

          <button
            className="tool-item"
            type="button"
            onClick={exportChat}
            disabled={!activeChat || messages.length === 0}
          >
            Export chat
          </button>

          <button
            className="tool-item"
            type="button"
            onClick={downloadResume}
          >
            Download current resume
          </button>
        </div>

        <div className="recent-title history-heading">
          CONVERSATION HISTORY
        </div>

        <div className="chat-list">
          {conversations.length === 0 && (
            <div className="empty-history">
              No conversations yet
            </div>
          )}

          {conversations.map((chat) => (
            <button
              key={chat.id}
              className={`chat-item ${
                chat.id === activeChatId ? "active" : ""
              }`}
              onClick={() => selectChat(chat.id)}
              type="button"
            >
              <span className="chat-icon">○</span>

              <span className="chat-name">
                {chat.title.length > 30
                  ? `${chat.title.slice(0, 30)}...`
                  : chat.title}
              </span>

              <span
                className="chat-delete"
                onClick={(event) =>
                  deleteChat(event, chat.id)
                }
                title="Delete chat"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarOpen && (
              <button
                className="open-sidebar-button"
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                ☰
              </button>
            )}

            <div>
              <div className="session-title">
                Shubham's AI Representative
              </div>
              <div className="session-subtitle">
                Ask questions about the candidate
              </div>
            </div>
          </div>

          <span className="version">Resume AI v1.0</span>
        </header>

        <section className="chat-area">
          {messages.length === 0 && (
            <div className="welcome">
              <div className="ai-icon">S</div>

              <h1>How can I help you?</h1>

              <p>
                Ask about Shubham's qualifications, projects,
                skills, experience or technical expertise.
              </p>

              <div className="suggestions">
                {suggestions.map((item, index) => (
                  <button
                    className="suggestion-card"
                    key={index}
                    onClick={() => askQuestion(item.question)}
                    disabled={loading}
                    type="button"
                  >
                    <div className="suggestion-header">
                      <span className="suggestion-icon">
                        {item.icon}
                      </span>

                      <span className="suggestion-title">
                        {item.title}
                      </span>
                    </div>

                    <p>{item.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="interview-messages">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`interview-message ${message.role}`}
                >
                  {message.role === "user" && (
                    <>
                      <div className="message-header">
                        <div className="hr-avatar">👤</div>
                        <div className="message-name">
                          HR Recruiter
                        </div>
                      </div>

                      <div className="hr-message-box">
                        {message.content}
                      </div>
                    </>
                  )}

                  {message.role === "assistant" && (
                    <>
                      <div className="message-header">
                        <div className="candidate-ai-icon">
                          S
                        </div>

                        <div className="message-name">
                          Candidate AI
                        </div>
                      </div>

                      <div className="ai-answer-box">
                        {message.content ? (
                          <div className="ai-text">
                            <ReactMarkdown>
                              {message.content}
                            </ReactMarkdown>

                            {loading &&
                              index === messages.length - 1 && (
                                <span className="stream-cursor">
                                  ▌
                                </span>
                              )}
                          </div>
                        ) : (
                          <div className="generating">
                            AI is generating
                            <span className="generating-dots">
                              ...
                            </span>
                          </div>
                        )}
                      </div>

                      {message.content && (
                        <button
                          className="copy-button"
                          onClick={() =>
                            copyAnswer(message.content)
                          }
                          type="button"
                        >
                          ⧉ Copy
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <div className="input-section">
          <div className="input-wrapper">
            <input
              type="text"
              placeholder={
                loading
                  ? "AI is generating a response..."
                  : "Ask any question about Shubham..."
              }
              value={question}
              disabled={loading}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  askQuestion();
                }
              }}
            />

            <button
              className="send-button"
              disabled={loading || !question.trim()}
              onClick={() => askQuestion()}
              type="button"
            >
              {loading ? "•••" : "➤"}
            </button>
          </div>

          <p className="input-note">
            AI answers using only the active candidate's resume.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;