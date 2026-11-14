(function () {
"use strict";

/* =====================================
   HEXCLØWN BOT ZONE CORE
   PART 1: CORE + AUTH + BOT DATABASE
===================================== */

const CONFIG = {
  SUPABASE_URL: "https://nddaaqvsnnrdylajpdmp.supabase.co",
  SUPABASE_KEY: "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",
  HEALTH_URL: "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health"
};

let supabase = null;
let initializationPromise = null;

function loadLibrary() {
  return new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";

    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Could not load Supabase library."));

    document.head.appendChild(script);
  });
}

async function initialize() {
  if (supabase) return supabase;

  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    await loadLibrary();

    supabase = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    return supabase;
  })();

  try {
    return await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

async function db() {
  return initialize();
}

async function requireUser() {
  const client = await db();

  const { data, error } = await client.auth.getUser();

  if (error) throw error;

  if (!data.user) {
    throw new Error("Please sign in first.");
  }

  return data.user;
}

function handleError(error) {
  if (error) {
    throw error;
  }
}

/* =====================================
   AUTHENTICATION
===================================== */

const auth = {

  async signIn(email, password) {
    const client = await db();

    const { data, error } =
      await client.auth.signInWithPassword({
        email,
        password
      });

    handleError(error);
    return data;
  },

  async signOut() {
    const client = await db();

    const { error } = await client.auth.signOut();

    handleError(error);
    return true;
  },

  async getUser() {
    const client = await db();

    const { data, error } = await client.auth.getUser();

    handleError(error);
    return data.user;
  },

  async getSession() {
    const client = await db();

    const { data, error } = await client.auth.getSession();

    handleError(error);
    return data.session;
  },

  onAuthChange(callback) {
    initialize().then(client => {
      client.auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
    });
  },

  async requireUser() {
    return requireUser();
  }
};

/* =====================================
   BACKEND HEALTH CHECK
===================================== */

const health = {

  async check() {
    const response = await fetch(CONFIG.HEALTH_URL);

    if (!response.ok) {
      throw new Error("Backend health check failed.");
    }

    return await response.json();
  }

};

/* =====================================
   BOT DATABASE
===================================== */

const bots = {

  async create(botData) {
    const client = await db();
    const user = await requireUser();

    const record = {
      owner_id: user.id,
      name: botData.name,
      description: botData.description || "",
      category: botData.category || "General",
      icon: botData.icon || "🤖",
      visibility: botData.visibility || "private",
      personality: botData.personality || "",
      response_style: botData.response_style || "Friendly",
      instructions: botData.instructions || "",
      welcome_message: botData.welcome_message || "",
      conversation_starter: botData.conversation_starter || "",
      active: botData.active !== false,
      favorite: botData.favorite === true,
      settings: botData.settings || {}
    };

    const { data, error } = await client
      .from("hexclown_bots")
      .insert(record)
      .select()
      .single();

    handleError(error);
    return data;
  },

  async list() {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_bots")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    handleError(error);
    return data || [];
  },

  async get(botId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_bots")
      .select("*")
      .eq("id", botId)
      .eq("owner_id", user.id)
      .maybeSingle();

    handleError(error);
    return data;
  },

  async update(botId, updates) {
    const client = await db();
    const user = await requireUser();

    const allowed = [
      "name",
      "description",
      "category",
      "icon",
      "visibility",
      "personality",
      "response_style",
      "instructions",
      "welcome_message",
      "conversation_starter",
      "active",
      "favorite",
      "settings"
    ];

    const cleanUpdates = {};

    allowed.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        cleanUpdates[key] = updates[key];
      }
    });

    cleanUpdates.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from("hexclown_bots")
      .update(cleanUpdates)
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select()
      .single();

    handleError(error);
    return data;
  },

  async delete(botId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_bots")
      .delete()
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    handleError(error);

    if (!data) {
      throw new Error("Bot was not found or could not be deleted.");
    }

    return true;
  },

  async toggleFavorite(botId, value) {
    const bot = await this.get(botId);

    if (!bot) throw new Error("Bot not found.");

    return this.update(botId, {
      favorite: value === undefined ? !bot.favorite : !!value
    });
  },

  async toggleActive(botId, value) {
    const bot = await this.get(botId);

    if (!bot) throw new Error("Bot not found.");

    return this.update(botId, {
      active: value === undefined ? !bot.active : !!value
    });
  }

};

/* END OF PART 1
   DO NOT ADD ANOTHER IIFE.
   WAIT FOR PART 2.
*//* =====================================
   CONVERSATION DATABASE
===================================== */

const conversations = {

  async create(data) {
    const client = await db();
    const user = await requireUser();

    const { data: bot, error: botError } = await client
      .from("hexclown_bots")
      .select("id")
      .eq("id", data.bot_id)
      .eq("owner_id", user.id)
      .maybeSingle();

    handleError(botError);

    if (!bot) throw new Error("Bot not found.");

    const { data: result, error } = await client
      .from("hexclown_conversations")
      .insert({
        owner_id: user.id,
        bot_id: data.bot_id,
        title: data.title || "New Conversation",
        status: "active"
      })
      .select()
      .single();

    handleError(error);
    return result;
  },

  async list(botId) {
    const client = await db();
    const user = await requireUser();

    let query = client
      .from("hexclown_conversations")
      .select("*")
      .eq("owner_id", user.id);

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false });

    handleError(error);
    return data || [];
  },

  async get(conversationId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .maybeSingle();

    handleError(error);
    return data;
  },

  async update(conversationId, updates) {
    const client = await db();
    const user = await requireUser();

    const clean = {};

    if (updates.title !== undefined) {
      clean.title = updates.title;
    }

    if (updates.status !== undefined) {
      clean.status = updates.status;
    }

    clean.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from("hexclown_conversations")
      .update(clean)
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .select()
      .single();

    handleError(error);
    return data;
  },

  async delete(conversationId) {
    const client = await db();
    const user = await requireUser();

    // Remove messages belonging to this conversation first.
    const { error: messageError } = await client
      .from("hexclown_messages")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("owner_id", user.id);

    handleError(messageError);

    const { data, error } = await client
      .from("hexclown_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    handleError(error);

    if (!data) {
      throw new Error("Conversation not found or could not be deleted.");
    }

    return true;
  }

};

/* =====================================
   MESSAGE DATABASE
===================================== */

const messages = {

  async save(conversationId, role, content) {
    const client = await db();
    const user = await requireUser();

    const { data: conversation, error: checkError } = await client
      .from("hexclown_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .maybeSingle();

    handleError(checkError);

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const allowedRoles = ["user", "assistant", "system"];

    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid message role.");
    }

    const { data, error } = await client
      .from("hexclown_messages")
      .insert({
        owner_id: user.id,
        conversation_id: conversationId,
        role,
        content: String(content)
      })
      .select()
      .single();

    handleError(error);
    return data;
  },

  async list(conversationId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });

    handleError(error);
    return data || [];
  },

  async delete(messageId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_messages")
      .delete()
      .eq("id", messageId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    handleError(error);

    if (!data) {
      throw new Error("Message not found or could not be deleted.");
    }

    return true;
  }

};

/* =====================================
   BOT KNOWLEDGE DATABASE
===================================== */

const knowledge = {

  async add(botId, item) {
    const client = await db();
    const user = await requireUser();

    const { data: bot, error: checkError } = await client
      .from("hexclown_bots")
      .select("id")
      .eq("id", botId)
      .eq("owner_id", user.id)
      .maybeSingle();

    handleError(checkError);

    if (!bot) throw new Error("Bot not found.");

    const { data, error } = await client
      .from("hexclown_knowledge")
      .insert({
        owner_id: user.id,
        bot_id: botId,
        title: item.title,
        content: item.content || "",
        source_type: item.source_type || "manual",
        metadata: item.metadata || {}
      })
      .select()
      .single();

    handleError(error);
    return data;
  },

  async list(botId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_knowledge")
      .select("*")
      .eq("bot_id", botId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    handleError(error);
    return data || [];
  },

  async delete(knowledgeId) {
    const client = await db();
    const user = await requireUser();

    const { data, error } = await client
      .from("hexclown_knowledge")
      .delete()
      .eq("id", knowledgeId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    handleError(error);

    if (!data) {
      throw new Error("Knowledge item not found or could not be deleted.");
    }

    return true;
  }

};

/* END OF PART 2
   WAIT FOR PART 3.
*//* =====================================
   USAGE TRACKING
===================================== */

const usage = {

  async record(data = {}) {
    const client = await db();
    const user = await requireUser();

    const { data: result, error } = await client
      .from("hexclown_usage")
      .insert({
        owner_id: user.id,
        bot_id: data.bot_id || null,
        conversation_id: data.conversation_id || null,
        provider: data.provider || "internal",
        model: data.model || "rule-based",
        request_type: data.request_type || "chat",
        input_tokens: Number(data.input_tokens) || 0,
        output_tokens: Number(data.output_tokens) || 0
      })
      .select()
      .single();

    handleError(error);
    return result;
  },

  async list(botId) {
    const client = await db();
    const user = await requireUser();

    let query = client
      .from("hexclown_usage")
      .select("*")
      .eq("owner_id", user.id);

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false });

    handleError(error);
    return data || [];
  }

};

/* =====================================
   ANALYTICS
===================================== */

const analytics = {

  async overview() {
    const [
      botList,
      conversationList,
      usageList
    ] = await Promise.all([
      bots.list(),
      conversations.list(),
      usage.list()
    ]);

    const activeBots = botList.filter(bot => bot.active).length;

    const favorites = botList.filter(bot => bot.favorite).length;

    const totalInput = usageList.reduce(
      (sum, item) => sum + (item.input_tokens || 0),
      0
    );

    const totalOutput = usageList.reduce(
      (sum, item) => sum + (item.output_tokens || 0),
      0
    );

    return {
      total_bots: botList.length,
      active_bots: activeBots,
      favorite_bots: favorites,
      total_conversations: conversationList.length,
      total_requests: usageList.length,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      total_tokens: totalInput + totalOutput
    };
  },

  async bot(botId) {
    const [
      bot,
      conversationList,
      knowledgeList,
      usageList
    ] = await Promise.all([
      bots.get(botId),
      conversations.list(botId),
      knowledge.list(botId),
      usage.list(botId)
    ]);

    if (!bot) {
      throw new Error("Bot not found.");
    }

    return {
      bot,
      total_conversations: conversationList.length,
      total_knowledge: knowledgeList.length,
      total_requests: usageList.length,
      input_tokens: usageList.reduce(
        (sum, item) => sum + (item.input_tokens || 0), 0
      ),
      output_tokens: usageList.reduce(
        (sum, item) => sum + (item.output_tokens || 0), 0
      )
    };
  }

};

/* =====================================
   PUBLIC CORE CONNECTION
===================================== */

const HEXCLOWN = {

  version: "1.0.0",

  ready: initialize,

  initialize,

  auth,

  health,

  bots,

  conversations,

  messages,

  knowledge,

  usage,

  analytics,

  async getUser() {
    return requireUser();
  }

};

window.HEXCLØWN = HEXCLOWN;

/* =====================================
   CORE READY EVENT
===================================== */

initialize()
  .then(() => {
    console.log("HEXCLØWN CORE: READY");

    window.dispatchEvent(
      new CustomEvent("hexclown:ready")
    );
  })
  .catch(error => {
    console.error("HEXCLØWN CORE ERROR:", error);
  });

})();
