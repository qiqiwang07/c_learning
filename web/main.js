const API_BASE = "/c_learning";

const aiSendBtn = document.getElementById("ai-send");
const aiInput = document.getElementById("ai-input");
const aiOutput = document.getElementById("ai-output");

function appendAiMessage(role, text) {
  const div = document.createElement("div");
  div.className = role === "user" ? "ai-msg user" : "ai-msg assistant";
  div.textContent = text;
  aiOutput.appendChild(div);
  aiOutput.scrollTop = aiOutput.scrollHeight;
}

async function sendAiMessage() {
  const question = aiInput.value.trim();

  if (!question) {
    alert("请输入问题");
    return;
  }

  appendAiMessage("user", question);
  aiInput.value = "";

  aiSendBtn.disabled = true;
  aiSendBtn.textContent = "发送中...";

  try {
    const res = await fetch(`${API_BASE}/api/ai`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      appendAiMessage("assistant", `错误：${data.error || "AI 请求失败"}${data.detail ? "\n" + data.detail : ""}`);
      return;
    }

    appendAiMessage("assistant", data.answer);
  } catch (err) {
    appendAiMessage("assistant", `请求失败：${err.message}`);
  } finally {
    aiSendBtn.disabled = false;
    aiSendBtn.textContent = "发送";
  }
}

aiSendBtn.addEventListener("click", sendAiMessage);

aiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    sendAiMessage();
  }
});