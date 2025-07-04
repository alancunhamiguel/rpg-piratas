const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config"); // Certifique-se de que 'collection' está configurado corretamente para o seu modelo MongoDB
const http = require('http'); 
const { Server } = require("socket.io"); 

// Importar express-session e connect-mongo
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose'); 

// NOVO: Importar o modelo de mensagem de chat
const ChatMessage = require('./models/ChatMessage'); 

const app = express();

// --- Conexão com o Banco de Dados ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('ERRO: A variável de ambiente MONGODB_URI não está definida.');
    process.exit(1); 
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Conexão com o banco de dados estabelecida!');
  })
  .catch(err => {
    console.error('Database Cannot Be Connected!', err);
    process.exit(1); 
  });
// --- Fim da Conexão com o Banco de Dados ---

// Cria o servidor HTTP do Node.js usando o app Express
const server = http.createServer(app); 
const io = new Server(server); 

// Converter data em json 
app.use(express.json());
app.use(express.urlencoded({extended: false}));

// Configurar express-session
app.use(session({
    secret: process.env.SESSION_SECRET || 'sd@sds#fgewrwe3223321Da', 
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI, 
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'interval',
        autoRemoveInterval: 10
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14
    }
}));

// Usar ejs como view engine
app.set('view engine', 'ejs');

// Rota para a página de login
app.get("/", (req, res) => {
    // Se o usuário já estiver logado, redireciona para a home
    if (req.session.userId) {
        return res.redirect("/home");
    }
    res.render("login");
})

app.get("/signup", (req, res) => {
    res.render("signup");
})

// Middleware para verificar autenticação
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next(); // Usuário autenticado, continua para a próxima rota
    } else {
        res.redirect("/"); // Usuário não autenticado, redireciona para o login
    }
};

// Registro de usuário
app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.username,
        password: req.body.password,
        level: 0,
        inventory: []
    }

    // Checar se já existe o usuário na database
    try {
        const existingUser = await collection.findOne ({name: data.name});
        if(existingUser) {
            // Alterado: Enviar JSON com status de erro e mensagem
            return res.status(409).json({ success: false, message: "Tente outro Usuário. Esse já existe :(" });
        } else {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(data.password, saltRounds);

            data.password = hashedPassword;

            const userdata = await collection.insertMany(data);
            console.log(userdata);
            // Alterado: Enviar JSON com status de sucesso e mensagem
            return res.status(200).json({ success: true, message: "Usuário cadastrado com sucesso!" });
        }
    } catch (error) {
        console.error("Erro ao verificar ou cadastrar usuário:", error);
        // Alterado: Enviar JSON com status de erro e mensagem
        return res.status(500).json({ success: false, message: "Erro ao cadastrar usuário. Tente novamente." });
    }
}); 

// Login de usuário
app.post("/login", async (req, res) => {
    try{
        const check = await collection.findOne({name: req.body.username});
        
        if(!check){
            return res.send("Usuário não encontrado");
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password);
        
        if(isPasswordMatch) {
            req.session.userId = check._id;
            req.session.userName = check.name;
            req.session.userLevel = check.level;
            req.session.userInventory = check.inventory || [];

            req.session.battle = null;
            req.session.inventoryOpen = null;

            res.redirect("/home");
        } else {
            res.send("Senha Errada");
        }
    } catch(error) {
        console.error("Erro durante o login:", error);
        res.status(500).send("Usuário e senha não conferem ou ocorreu um erro interno."); 
    }
});

// Rota Home (protegida)
app.get("/home", isAuthenticated, (req, res) => {
    res.render("home", { 
        userName: req.session.userName, 
        userLevel: req.session.userLevel,
        userInventory: req.session.userInventory,
        battleState: req.session.battle || null,
        inventoryState: req.session.inventoryOpen || null
    });
});

// Rota para iniciar/reiniciar a batalha
app.get("/battle/start", isAuthenticated, (req, res) => {
    console.log("Rota /battle/start acessada.");
    req.session.battle = {
        playerHP: 100,
        enemyHP: 50,
        enemyName: "Orc Pirata",
        enemyLevel: 1,
        battleLog: ["A batalha contra o Orc Pirata começou!"],
        status: "active"
    };
    req.session.inventoryOpen = null;
    res.redirect("/home");
});

// Rota para o jogador atacar
app.post("/battle/attack", isAuthenticated, async (req, res) => {
    const battle = req.session.battle;

    if (!battle || battle.status !== "active") {
        return res.json({ message: "Nenhuma batalha ativa.", battleState: battle });
    }

    const playerDamage = 20;
    const enemyDamage = 15;

    battle.enemyHP -= playerDamage;
    battle.battleLog.push(`Você atacou o ${battle.enemyName} e causou ${playerDamage} de dano.`);

    if (battle.enemyHP <= 0) {
        battle.enemyHP = 0;
        battle.status = "win";
        battle.battleLog.push(`Você derrotou o ${battle.enemyName}!`);
        
        req.session.userLevel += 1;
        battle.battleLog.push(`Você ganhou 1 nível! Seu novo nível é ${req.session.userLevel}.`);

        const droppedItem = "Moeda de Ouro";
        req.session.userInventory.push(droppedItem);
        battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

        try {
            await collection.updateOne(
                { _id: req.session.userId },
                { $set: { level: req.session.userLevel, inventory: req.session.userInventory } }
            );
            battle.battleLog.push("Seu progresso foi salvo.");
        } catch (error) {
            console.error("Erro ao salvar progresso:", error);
            battle.battleLog.push("Erro ao salvar seu progresso.");
        }

        return res.json({ message: "Vitória!", battleState: battle, userLevel: req.session.userLevel, userInventory: req.session.userInventory });
    }

    battle.playerHP -= enemyDamage;
    battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage} de dano.`);

    if (battle.playerHP <= 0) {
        battle.playerHP = 0;
        battle.status = "lose";
        battle.battleLog.push(`Você foi derrotado pelo ${battle.enemyName}...`);
        return res.json({ message: "Derrota!", battleState: battle });
    }

    res.json({ message: "Turno concluído.", battleState: battle });
});

// Rota para resetar a batalha (voltar para a home sem batalha ativa)
app.post("/battle/reset", isAuthenticated, (req, res) => {
    console.log("Rota /battle/reset acessada.");
    req.session.battle = null;
    res.json({ message: "Batalha resetada." });
});

// Rota para exibir o inventário
app.get("/inventory/show", isAuthenticated, (req, res) => {
    console.log("Rota /inventory/show acessada.");
    req.session.inventoryOpen = true;
    req.session.battle = null;
    res.redirect("/home");
});

// Rota para esconder o inventário e voltar para a home
app.get("/inventory/hide", isAuthenticated, (req, res) => {
    console.log("Rota /inventory/hide acessada.");
    req.session.inventoryOpen = null;
    res.redirect("/home");
});

// Rota para atualizar o inventário do usuário no banco de dados
app.post("/inventory/update", isAuthenticated, async (req, res) => {
    console.log("Rota /inventory/update acessada.");
    try {
        let { inventory } = req.body;
        
        if (!Array.isArray(inventory)) {
            console.warn("Received non-array inventory from client. Resetting to empty array.");
            inventory = [];
        }

        req.session.userInventory = inventory;

        await collection.updateOne(
            { _id: req.session.userId },
            { $set: { inventory: inventory } }
        );

        res.json({ success: true, message: "Inventário atualizado com sucesso!", inventory: inventory });
    } catch (error) {
        console.error("Erro ao atualizar inventário:", error);
        res.status(500).json({ success: false, message: "Erro interno ao atualizar inventário." });
    }
});

// Rota de Logout
app.get("/logout", (req, res) => {
    console.log("Rota /logout acessada.");
    req.session.destroy(err => {
        if (err) {
            console.error("Erro ao destruir sessão:", err);
            return res.send("Erro ao fazer logout.");
        }
        res.redirect("/");
    });
});

// --- Lógica do Socket.IO (MODIFICADA PARA SALVAR E CARREGAR MENSAGENS) ---
io.on('connection', async (socket) => { // <--- Tornar a função async
    console.log('Um usuário conectado ao chat:', socket.id);

    // Carregar histórico de mensagens ao conectar
    try {
        // Busca as últimas 50 mensagens, ordenadas da mais antiga para a mais recente
        const messages = await ChatMessage.find()
                                          .sort({ timestamp: 1 }) // Ordem ascendente
                                          .limit(50); // Limita a 50 mensagens
        
        messages.forEach(chatMsg => {
            // Emite cada mensagem do histórico apenas para o socket que acabou de conectar
            socket.emit('chat message', `${chatMsg.sender}: ${chatMsg.message}`);
        });
        console.log(`Histórico de ${messages.length} mensagens carregado para ${socket.id}`);

    } catch (error) {
        console.error("Erro ao carregar histórico de mensagens:", error);
    }

    // Escuta por mensagens de chat de um cliente
    socket.on('chat message', async (fullMsg) => { // <--- Tornar a função async
        console.log('Mensagem recebida do cliente:', fullMsg);

        // Extrai o nome do remetente e o conteúdo da mensagem
        // Assumimos o formato "Nome do Usuário: Mensagem" que vem do frontend
        const parts = fullMsg.split(': ');
        let sender = 'Desconhecido';
        let messageContent = fullMsg; // fallback, caso não consiga parsear

        if (parts.length > 1) {
            sender = parts[0];
            messageContent = parts.slice(1).join(': '); // Junta o resto de volta caso a mensagem tenha múltiplos ':'
        }

        try {
            // Salva a mensagem no banco de dados
            const newChatMessage = new ChatMessage({
                sender: sender,
                message: messageContent
            });
            await newChatMessage.save();
            console.log('Mensagem salva no banco de dados:', newChatMessage);

            // Emite a mensagem (o fullMsg original) para TODOS os clientes conectados
            io.emit('chat message', fullMsg); 

        } catch (error) {
            console.error("Erro ao salvar mensagem no banco de dados:", error);
            // Opcional: emitir um erro de volta para o cliente que tentou enviar a mensagem
            socket.emit('chat error', 'Erro ao enviar mensagem.');
        }
    });

    // Quando um cliente se desconecta
    socket.on('disconnect', () => {
        console.log('Um usuário desconectado do chat:', socket.id);
    });
});
// --- Fim da Lógica do Socket.IO ---

const port = process.env.PORT || 5000;
server.listen(port, () => { 
    console.log(`Server running on port: ${port}`);
});