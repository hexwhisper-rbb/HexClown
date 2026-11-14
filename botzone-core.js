(function () {
"use strict";

/* =========================================
   HEXCLØWN CORE CONFIGURATION
========================================= */

const CONFIG = {
  SUPABASE_URL:
    "https://nddaaqvsnnrdylajpdmp.supabase.co",

  SUPABASE_KEY:
    "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",

  HEALTH_URL:
    "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health"
};


/* =========================================
   INTERNAL STATE
========================================= */

let supabaseClient = null;
let initializationPromise = null;


/* =========================================
   SUPABASE INITIALIZATION
========================================= */

function loadLibrary() {
  return new Promise((resolve, reject) => {

    if (window.supabase && window.supabase.createClient) {
      resolve();
      return;
    }

    const script = document.createElement("script");

    script.src =
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

    script.onload = resolve;

    script.onerror = function () {
      reject(new Error("Could not load Supabase library."));
    };

    document.head.appendChild(script);
  });
}


async function db() {
  if (supabaseClient) {
    return supabaseClient;
  }

  await loadLibrary();

  supabaseClient = window.supabase.createClient(
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

  return supabaseClient;
}


async function initialize() {
  if (!initializationPromise) {

    initializationPromise = (async function () {
      await db();

      const user = await requireUser();

      return {
        success: true,
        user: user
      };
    })();
  }

  return initializationPromise;
}


/* =========================================
   AUTHENTICATION
========================================= */

async function requireUser() {
  const client = await db();

  const {
    data,
    error
  } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Please sign in first.");
  }

  return data.user;
}


const auth = {

  async getUser() {
    const client = await db();

    const {
      data,
      error
    } = await client.auth.getUser();

    if (error) throw error;

    return data.user || null;
  },


  async getSession() {
    const client = await db();

    const {
      data,
      error
    } = await client.auth.getSession();

    if (error) throw error;

    return data.session || null;
  },


  async signIn(email, password) {
    const client = await db();

    const {
      data,
      error
    } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    return data;
  },


  async signOut() {
    const client = await db();

    const {
      error
    } = await client.auth.signOut();

    if (error) throw error;

    return true;
  },


  onAuthChange(callback) {
    db().then(client => {

      client.auth.onAuthStateChange(
        (event, session) => {
          callback(event, session);
        }
      );

    });
  }

};


/* =========================================
   BACKEND HEALTH
========================================= */

const health = {

  async check() {
    const response = await fetch(
      CONFIG.HEALTH_URL,
      {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Backend health check failed: " + response.status
      );
    }

    return await response.json();
  }

};


/* =========================================
   BOT MANAGEMENT
========================================= */

const bots = {

  async create(botData = {}) {
    const client = await db();
    const user = await requireUser();

    if (!botData.name || !String(botData.name).trim()) {
      throw new Error("Bot name is required.");
    }

    const record = {
      owner_id: user.id,

      name: String(botData.name).trim(),

      description: botData.description || "",

      category: botData.category || "General",

      icon: botData.icon || "🤖",

      visibility: botData.visibility || "private",

      personality: botData.personality || "",

      response_style:
        botData.response_style || "Friendly",

      instructions: botData.instructions || "",

      welcome_message:
        botData.welcome_message || "",

      conversation_starter:
        botData.conversation_starter || "",

      active: botData.active !== false,

      favorite: botData.favorite === true,

      settings: botData.settings || {}
    };

    const {
      data,
      error
    } = await client
      .from("hexclown_bots")
      .insert(record)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },


  async list() {
    const client = await db();
    const user = await requireUser();

    const {
      data,
      error
    } = await client
      .from("hexclown_bots")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    return data || [];
  },


  async get(botId) {
    const client = await db();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    const {
      data,
      error
    } = await client
      .from("hexclown_bots")
      .select("*")
      .eq("id", botId)
      .eq("owner_id", user.id)
      .single();

    if (error) throw error;

    return data;
  },


  async update(botId, changes = {}) {
    const client = await db();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

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

    const safeChanges = {};

    allowed.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        safeChanges[key] = changes[key];
      }
    });

    safeChanges.updated_at = new Date().toISOString();

    const {
      data,
      error
    } = await client
      .from("hexclown_bots")
      .update(safeChanges)
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },


  async delete(botId) {
    const client = await db();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    const {
      data,
      error
    } = await client
      .from("hexclown_bots")
      .delete()
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Bot not found or could not be deleted.");
    }

    return true;
  },


  async toggleFavorite(botId) {
    const bot = await this.get(botId);

    return await this.update(botId, {
      favorite: !bot.favorite
    });
  },


  async toggleActive(botId) {
    const bot = await this.get(botId);

    return await this.update(botId, {
      active: !bot.active
    });
  }

};


/* END OF PART 1 *//* =========================================
   CONVERSATION MANAGEMENT
========================================= */

const conversations = {

  async create(botId, title = "New Conversation") {
    const client = await db();
    const user = await requireUser();

    if (!botId || typeof botId !== "string") {
      throw new Error("A valid bot ID is required.");
    }

    // Confirm that this bot belongs to the signed-in user.
    const bot = await bots.get(botId);

    if (!bot || !bot.id) {
      throw new Error("Bot not found.");
    }

    const record = {
      owner_id: user.id,
      bot_id: bot.id,
      title: title || "New Conversation",
      status: "active"
    };

    const {
      data,
      error
    } = await client
      .from("hexclown_conversations")
      .insert(record)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },


  async list(botId = null) {
    const client = await db();
    const user = await requireUser();

    let query = client
      .from("hexclown_conversations")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", {
        ascending: false
      });

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const {
      data,
      error
    } = await query;

    if (error) throw error;

    return data || [];
  },


  async get(conversationId) {
    const client = await db();
    const user = await requireUser();

    if (!conversationId) {
      throw new Error("Conversation ID is required.");
    }

    const {
      data,
      error
    } = await client
      .from("hexclown_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .single();

    if (error) throw error;

    return data;
  },


  async update(conversationId, changes = {}) {
    const client = await db();
    const user = await requireUser();

    if (!conversationId) {
      throw new Error("Conversation ID is required.");
    }

    const safeChanges = {};

    if (typeof changes.title === "string") {
      safeChanges.title = changes.title;
    }

    if (typeof changes.status === "string") {
      safeChanges.status = changes.status;
    }

    safeChanges.updated_at = new Date().toISOString();

    const {
      data,
      error
    } = await client
      .from("hexclown_conversations")
      .update(safeChanges)
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },


  async delete(conversationId) {
    const client = await db();
    const user = await requireUser();

    if (!conversationId) {
      throw new Error("Conversation ID is required.");
    }

    // Verify ownership before deleting associated messages.
    await this.get(conversationId);

    const {
      error: messageError
    } = await client
      .from("hexclown_messages")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("owner_id", user.id);

    if (messageError) throw messageError;

    const {
      data,
      error
    } = await client
      .from("hexclown_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Conversation could not be deleted.");
    }

    return true;
  }

};


/* =========================================
   MESSAGE MANAGEMENT
========================================= */

const messages = {

  async save(conversationId, role, content, metadata = {}) {
    const client = await db();
    const user = await requireUser();

    if (!conversationId) {
      throw new Error("Conversation ID is required.");
    }

    if (!role || !content) {
      throw new Error("Message role and content are required.");
    }

    // Verify conversation ownership.
    await conversations.get(conversationId);

    const record = {
      owner_id: user.id,
      conversation_id: conversationId,
      role: role,
      content: content,
      metadata: metadata || {}
    };

    const {
      data,
      error
    } = await client
      .from("hexclown_messages")
      .insert(record)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },


  async list(conversationId) {
    const client = await db();
    const user = await requireUser();

    if (!conversationId) {
      throw new Error("Conversation ID is required.");
    }

    await conversations.get(conversationId);

    const {
      data,
      error
    } = await client
      .from("hexclown_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("owner_id", user.id)
      .order("created_at", {
        ascending: true
      });

    if (error) throw error;

    return data || [];
  },


  async delete(messageId) {
    const client = await db();
    const user = await requireUser();

    if (!messageId) {
      throw new Error("Message ID is required.");
    }

    const {
      data,
      error
    } = await client
      .from("hexclown_messages")
      .delete()
      .eq("id", messageId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Message not found or could not be deleted.");
    }

    return true;
  }

};


/* =========================================
   BOT KNOWLEDGE MANAGEMENT
========================================= */

const knowledge = {

  async add(botId, title, content, metadata = {}) {
    const client = await db();
    const user = await requireUser();

    if (!botId || !title) {
      throw new Error("Bot ID and knowledge title are required.");
    }

    await bots.get(botId);

    const record = {
      owner_id: user.id,
      bot_id: botId,
      title: title,
      content: content || "",
      source_type: metadata.source_type || "text",
      metadata: metadata || {}
    };

    const {
      data,
      error
    } = await client
      .from("hexclown_knowledge")
      .insert(record)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },


  async list(botId) {
    const client = await db();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    await bots.get(botId);

    const {
      data,
      error
    } = await client
      .from("hexclown_knowledge")
      .select("*")
      .eq("bot_id", botId)
      .eq("owner_id", user.id)
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    return data || [];
  },


  async delete(knowledgeId) {
    const client = await db();
    const user = await requireUser();

    if (!knowledgeId) {
      throw new Error("Knowledge ID is required.");
    }

    const {
      data,
      error
    } = await client
      .from("hexclown_knowledge")
      .delete()
      .eq("id", knowledgeId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Knowledge item not found or could not be deleted.");
    }

    return true;
  }

};


/* END OF PART 2 *//* =========================================
   USAGE TRACKING
========================================= */

const usage = {

  async record(data = {}) {
    const client = await db();
    const user = await requireUser();

    if (data.bot_id) {
      await bots.get(data.bot_id);
    }

    if (data.conversation_id) {
      await conversations.get(data.conversation_id);
    }

    const record = {
      owner_id: user.id,
      bot_id: data.bot_id || null,
      conversation_id: data.conversation_id || null,
      provider: data.provider || "internal",
      model: data.model || "rule-based",
      request_type: data.request_type || "chat",
      input_tokens: Number(data.input_tokens || 0),
      output_tokens: Number(data.output_tokens || 0)
    };

    const { data: saved, error } = await client
      .from("hexclown_usage")
      .insert(record)
      .select("*")
      .single();

    if (error) throw error;

    return saved;
  },


  async list(botId = null) {
    const client = await db();
    const user = await requireUser();

    let query = client
      .from("hexclown_usage")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  },


  async delete(usageId) {
    const client = await db();
    const user = await requireUser();

    if (!usageId) {
      throw new Error("Usage ID is required.");
    }

    const { data, error } = await client
      .from("hexclown_usage")
      .delete()
      .eq("id", usageId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Usage record not found or could not be deleted.");
    }

    return true;
  }

};


/* =========================================
   ANALYTICS
========================================= */

const analytics = {

  async overview() {
    const [
      allBots,
      allConversations,
      allUsage
    ] = await Promise.all([
      bots.list(),
      conversations.list(),
      usage.list()
    ]);

    const inputTokens = allUsage.reduce(
      (sum, item) =>
        sum + Number(item.input_tokens || 0),
      0
    );

    const outputTokens = allUsage.reduce(
      (sum, item) =>
        sum + Number(item.output_tokens || 0),
      0
    );

    return {
      total_bots: allBots.length,

      active_bots: allBots.filter(
        item => item.active === true
      ).length,

      favorite_bots: allBots.filter(
        item => item.favorite === true
      ).length,

      total_conversations: allConversations.length,

      total_requests: allUsage.length,

      input_tokens: inputTokens,

      output_tokens: outputTokens,

      total_tokens: inputTokens + outputTokens
    };
  },


  async bot(botId) {
    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    const [
      bot,
      botConversations,
      botKnowledge,
      botUsage
    ] = await Promise.all([
      bots.get(botId),
      conversations.list(botId),
      knowledge.list(botId),
      usage.list(botId)
    ]);

    const inputTokens = botUsage.reduce(
      (sum, item) =>
        sum + Number(item.input_tokens || 0),
      0
    );

    const outputTokens = botUsage.reduce(
      (sum, item) =>
        sum + Number(item.output_tokens || 0),
      0
    );

    return {
      bot: bot,

      total_conversations: botConversations.length,

      total_knowledge: botKnowledge.length,

      total_requests: botUsage.length,

      input_tokens: inputTokens,

      output_tokens: outputTokens,

      total_tokens: inputTokens + outputTokens
    };
  }

};


/* =========================================
   PUBLIC HEXCLØWN API
========================================= */

const HEXCLØWN = {

  version: "2.0.0",

  ready: false,

  initialize: initialize,

  auth: auth,

  health: health,

  bots: bots,

  conversations: conversations,

  messages: messages,

  knowledge: knowledge,

  usage: usage,

  analytics: analytics,

  getUser: requireUser

};


/* =========================================
   EXPOSE CORE
========================================= */

window["HEXCLØWN"] = HEXCLØWN;


/* =========================================
   START CORE
========================================= */

initialize()
  .then(function () {

    HEXCLØWN.ready = true;

    console.log("HEXCLØWN CORE READY");

    window.dispatchEvent(
      new CustomEvent("hexclown:ready")
    );

  })
  .catch(function (error) {

    console.error(
      "HEXCLØWN INITIALIZATION FAILED:",
      error
    );

  });


/* =========================================
   END OF HEXCLØWN CORE
========================================= */

})();
