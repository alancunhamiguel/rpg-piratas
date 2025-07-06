const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
// Se 'config' (seu modelo de usuário) está na mesma pasta que index.js (ou seja, src/)
const collection = require("./config"); // Seu modelo de usuário (LoginSchema)
const http = require('http');
const { Server } = require("socket.io");
// CORRIGIDO: Removido o '.' extra e o 'src/' inicial
const Character = require('./models/Character'); // Importa o novo modelo de Personagem
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// CORRIGIDO: Removido o 'src/' inicial
const ChatMessage = require('./models/ChatMessage'); // Ajustado o caminho para src/models/ChatMessage

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
app.use(express.urlencoded({ extended: false }));

// Configurar caminho para arquivos estáticos (CSS, imagens, etc.)
app.use(express.static("public")); // Garanta que sua pasta 'public' existe com os arquivos CSS/JS

// Configurar express-session
app.use(session({
    secret: process.env.SESSION_SECRET || 'sd@sds#fgewrwe3223321Da', // Use uma variável de ambiente para isso!
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 14 * 24 * 60 * 60, // 14 dias
        autoRemove: 'interval',
        autoRemoveInterval: 10 // Remove sessões expiradas a cada 10 minutos
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14 // 14 dias
    }
}));

// Usar ejs como view engine
app.set('view engine', 'ejs');


// ----------------------------------------------------------------------
// MIDDLEWARES DE AUTENTICAÇÃO E VERIFICAÇÃO DE PERSONAGEM
// ----------------------------------------------------------------------

// Middleware para verificar se o usuário está logado
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next(); // Usuário autenticado, continua para a próxima rota
    }
    // Redireciona para a página de login se não estiver autenticado
    res.redirect("/");
};

// Middleware para verificar se o usuário está logado E tem um personagem selecionado
const isAuthenticatedAndCharacterSelected = async (req, res, next) => {
    if (req.session.userId && req.session.activeCharacterId) {
        return next();
    }
    // Se não estiver logado, vai para a raiz (login)
    if (!req.session.userId) {
        return res.redirect('/');
    }
    // Se estiver logado, mas sem personagem selecionado, redireciona para a seleção de personagem
    // Isso é importante para garantir que o usuário selecione um personagem antes de ir para a home
    return res.redirect('/select-character');
};


// ----------------------------------------------------------------------
// ROTAS DE AUTENTICAÇÃO E CADASTRO
// ----------------------------------------------------------------------

// Rota para a página de login/cadastro (página inicial)
app.get("/", (req, res) => {
    // Se o usuário já estiver logado, redireciona para a seleção de personagem
    // ou para criação se ele não tiver personagens ainda.
    if (req.session.userId) {
        return res.redirect("/select-character"); // Novo fluxo
    }
    res.render("login");
});

// Rota para a página de cadastro
app.get("/signup", (req, res) => {
    res.render("signup");
});

// Registrar Usuário
app.post("/signup", async (req, res) => {
    const data = {
        name: req.body.username,
        password: req.body.password,
        // 'level' e 'inventory' foram removidos do modelo de usuário,
        // eles agora pertencem ao modelo Character.
        // O array 'characters' no modelo de usuário será preenchido após a criação do personagem.
    };

    try {
        const existingUser = await collection.findOne({ name: data.name });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "Tente outro Usuário. Esse já existe :(" });
        } else {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(data.password, saltRounds);
            data.password = hashedPassword;

            // Insere o novo usuário (sem personagens ainda)
            const newUser = await collection.create(data); // Use create para retornar o documento criado
            console.log("Novo usuário cadastrado:", newUser.name);

            // Redireciona para a página de criação de personagem após o cadastro bem-sucedido
            return res.status(200).json({ success: true, message: "Usuário cadastrado com sucesso!", redirectTo: '/create-character' });
        }
    } catch (error) {
        console.error("Erro ao cadastrar usuário:", error);
        return res.status(500).json({ success: false, message: "Erro ao cadastrar usuário. Tente novamente." });
    }
});

// Login do Usuário
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await collection.findOne({ name: username });

        if (!user) {
            return res.json({ success: false, message: "Nome de usuário não encontrado." });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.json({ success: false, message: "Senha incorreta." });
        }

        // Autenticação bem-sucedida, armazena o ID do usuário na sessão
        req.session.userId = user._id;

        // Popula os personagens do usuário para verificar se ele já tem algum
        const userWithCharacters = await collection.findById(user._id).populate('characters');

        if (userWithCharacters.characters.length === 0) {
            // Se não tiver personagens, redireciona para a criação de personagem
            return res.json({ success: true, message: "Login bem-sucedido! Crie seu primeiro personagem.", redirectTo: '/create-character' });
        } else {
            // Se tiver personagens, redireciona para a seleção de personagem
            return res.json({ success: true, message: "Login bem-sucedido! Selecione seu personagem.", redirectTo: '/select-character' });
        }

    } catch (error) {
        console.error("Erro durante o login:", error);
        res.json({ success: false, message: "Erro interno do servidor durante o login." });
    }
});

// Rota de Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Erro ao destruir sessão:", err);
            return res.redirect('/home'); // Ou para onde quiser em caso de erro
        }
        res.clearCookie('connect.sid'); // Limpa o cookie da sessão
        res.redirect('/'); // Redireciona para a página de login
    });
});


// ----------------------------------------------------------------------
// ROTAS DE GERENCIAMENTO DE PERSONAGENS
// ----------------------------------------------------------------------

// Rota para a página de criação de personagem
app.get('/create-character', isAuthenticated, async (req, res) => {
    try {
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.redirect('/'); // Usuário não encontrado, redireciona para login
        }

        // Se o usuário já tiver 2 personagens, redireciona para a tela de seleção
        if (user.characters.length >= 2) {
            return res.redirect('/select-character');
        }
        // Se tiver menos de 2 personagens, renderiza a página de criação
        res.render('create-character', { user: user });
    } catch (error) {
        console.error("Erro ao carregar página de criação de personagem:", error);
        res.redirect('/'); // Em caso de erro, redireciona para login
    }
});

// Rota para processar a criação de personagem
app.post('/create-character', isAuthenticated, async (req, res) => {
    const { name, type, gender, characterClass } = req.body;

    try {
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        }

        if (user.characters.length >= 2) {
            return res.status(400).json({ success: false, message: "Você já possui o número máximo de personagens (2)." });
        }

        // Verificar se já existe um personagem com este nome para ESTE USUÁRIO
        // A unique index em CharacterSchema.index({ owner: 1, name: 1 }, { unique: true }); já cuida disso,
        // mas uma verificação explícita aqui pode dar uma mensagem de erro mais amigável.
        const existingCharacterForUser = await Character.findOne({ owner: req.session.userId, name: name });
        if (existingCharacterForUser) {
            return res.status(409).json({ success: false, message: "Você já tem um personagem com este nome. Escolha outro." });
        }

        // Criar o novo personagem
        const newCharacter = new Character({
            name: name,
            owner: req.session.userId,
            type: type,
            gender: gender,
            class: characterClass,
            // Outros campos como level, experience, stats, hp, maxHp terão valores default do schema
        });

        await newCharacter.save();

        // Adicionar o ID do novo personagem ao array de characters do usuário
        user.characters.push(newCharacter._id);
        await user.save();

        // Após criar, redireciona para a tela de seleção de personagem
        return res.status(200).json({ success: true, message: "Personagem criado com sucesso!", redirectTo: '/select-character' });

    } catch (error) {
        // Mongoose ValidationError (ex: enum inválido) ou outro erro de DB
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        console.error("Erro ao criar personagem:", error);
        return res.status(500).json({ success: false, message: "Erro interno ao criar personagem. Tente novamente." });
    }
});


// Rota para a página de seleção de personagem
app.get('/select-character', isAuthenticated, async (req, res) => {
    try {
        // Popula os personagens do usuário para exibi-los
        const user = await collection.findById(req.session.userId).populate('characters');
        if (!user) {
            return res.redirect('/');
        }

        // Se o usuário não tiver personagens, redireciona para a criação
        if (user.characters.length === 0) {
            return res.redirect('/create-character');
        }

        res.render('select-character', { characters: user.characters });
    } catch (error) {
        console.error("Erro ao carregar seleção de personagem:", error);
        res.redirect('/');
    }
});

// Rota para processar a seleção de personagem
app.post('/select-character', isAuthenticated, async (req, res) => {
    const { characterId } = req.body;

    try {
        const user = await collection.findById(req.session.userId);
        // Garante que o personagem realmente pertence ao usuário logado
        if (!user || !user.characters.includes(characterId)) {
            return res.status(403).json({ success: false, message: "Personagem inválido ou não pertence a este usuário." });
        }

        // Armazena o ID do personagem selecionado na sessão
        req.session.activeCharacterId = characterId;
        // Limpa os dados de batalha e inventário antigos da sessão, pois eles são do personagem
        req.session.battle = null;
        req.session.inventoryOpen = null;


        return res.status(200).json({ success: true, message: "Personagem selecionado!", redirectTo: '/home' });

    } catch (error) {
        console.error("Erro ao selecionar personagem:", error);
        return res.status(500).json({ success: false, message: "Erro interno ao selecionar personagem." });
    }
});


// ----------------------------------------------------------------------
// ROTA HOME (REQUER PERSONAGEM ATIVO)
// ----------------------------------------------------------------------

// Rota para a página principal do jogo (Home)
app.get("/home", isAuthenticatedAndCharacterSelected, async (req, res) => {
    try {
        const user = await collection.findById(req.session.userId);
        const activeCharacter = await Character.findById(req.session.activeCharacterId);

        if (!user || !activeCharacter) {
            // Caso algo dê errado (usuário ou personagem não encontrado na sessão),
            // limpa a sessão e redireciona para login
            console.warn("Usuário ou personagem ativo não encontrado na sessão. Redirecionando para login.");
            req.session.destroy(() => {
                res.redirect('/');
            });
            return;
        }

        // Passa os dados do personagem ativo para a home
        res.render("home", {
            userName: user.name, // Nome do usuário
            character: activeCharacter, // O objeto completo do personagem ativo
            battleState: req.session.battle || null,
            inventoryState: req.session.inventoryOpen || null
        });
    } catch (error) {
        console.error("Erro ao carregar página home:", error);
        // Em caso de erro, redireciona para a raiz (login)
        res.redirect('/');
    }
});

// ----------------------------------------------------------------------
// ROTAS DE BATALHA E INVENTÁRIO (AJUSTADAS PARA USAR DADOS DO PERSONAGEM)
// ----------------------------------------------------------------------

// Rota para iniciar/reiniciar a batalha
app.get("/battle/start", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Rota /battle/start acessada.");
    try {
        // Recupera o personagem ativo para pegar HP e outros stats iniciais
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.redirect('/select-character'); // Personagem não encontrado, força seleção
        }

        req.session.battle = {
            playerHP: activeCharacter.hp, // Usa o HP atual do personagem
            enemyHP: 50, // HP padrão do inimigo (você vai querer carregar isso de um modelo de inimigo real depois)
            enemyName: "Orc Pirata",
            enemyLevel: 1,
            battleLog: ["A batalha contra o Orc Pirata começou!"],
            status: "active"
        };
        req.session.inventoryOpen = null;
        res.redirect("/home");
    } catch (error) {
        console.error("Erro ao iniciar batalha:", error);
        res.redirect('/home');
    }
});

// Rota para o jogador atacar
app.post("/battle/attack", isAuthenticatedAndCharacterSelected, async (req, res) => {
    const battle = req.session.battle;

    if (!battle || battle.status !== "active") {
        return res.json({ message: "Nenhuma batalha ativa.", battleState: battle });
    }

    try {
        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.status(404).json({ message: "Personagem não encontrado.", battleState: battle });
        }

        // Usar stats do personagem para calcular dano
        const playerDamage = Math.max(1, activeCharacter.stats.attack - (battle.enemyLevel * 2)); // Exemplo de cálculo simples
        const enemyDamage = Math.max(1, (battle.enemyLevel * 5) - (activeCharacter.stats.defense / 2)); // Exemplo

        battle.enemyHP -= playerDamage;
        battle.battleLog.push(`Você (${activeCharacter.name}) atacou o ${battle.enemyName} e causou ${playerDamage} de dano.`);

        if (battle.enemyHP <= 0) {
            battle.enemyHP = 0;
            battle.status = "win";
            battle.battleLog.push(`Você derrotou o ${battle.enemyName}!`);

            // Lógica de XP e Level Up (após vitória)
            const expGained = 50; // Exemplo de XP
            activeCharacter.experience += expGained;
            battle.battleLog.push(`Você ganhou ${expGained} pontos de experiência.`);

            // Lógica de nível (você pode ter uma função para isso)
            let leveledUp = false;
            while (activeCharacter.experience >= (activeCharacter.level * 100)) { // Exemplo: 100 XP por nível
                activeCharacter.experience -= (activeCharacter.level * 100);
                activeCharacter.level += 1;
                activeCharacter.skillPoints += 4; // Ganha 4 pontos de status por nível
                activeCharacter.maxHp += 20; // Exemplo: aumenta HP máximo por nível
                activeCharacter.hp = activeCharacter.maxHp; // Cura total ao subir de nível
                battle.battleLog.push(`Parabéns! ${activeCharacter.name} alcançou o Nível ${activeCharacter.level}!`);
                battle.battleLog.push(`Você ganhou 4 pontos de status para distribuir.`);
                leveledUp = true;
            }

            // Lógica de Drop de Itens (exemplo simplificado)
            const droppedItem = "Moeda de Ouro";
            // Adiciona o item ao inventário do PERSONAGEM (não mais do usuário diretamente na sessão)
            const itemIndex = activeCharacter.inventory.findIndex(invItem => invItem.item.toString() === droppedItem); // Você precisaria de um ID de item real aqui
            // Por enquanto, apenas adiciona o nome como string, você vai refatorar isso com o modelo Item
            activeCharacter.inventory.push({ item: droppedItem, quantity: 1 }); // Simplificado

            battle.battleLog.push(`Você encontrou uma ${droppedItem}!`);

            // Salva as atualizações no PERSONAGEM
            await activeCharacter.save();

            return res.json({
                message: "Vitória!",
                battleState: battle,
                character: activeCharacter // Retorna o objeto de personagem atualizado
            });
        }

        // Turno do inimigo
        activeCharacter.hp -= enemyDamage; // Diminui o HP do PERSONAGEM
        battle.battleLog.push(`${battle.enemyName} atacou você e causou ${enemyDamage} de dano.`);

        if (activeCharacter.hp <= 0) {
            activeCharacter.hp = 0;
            battle.playerHP = 0; // Para sincronizar a exibição
            battle.status = "lose";
            battle.battleLog.push(`Você foi derrotado pelo ${battle.enemyName}...`);
            // Ao perder, talvez resete o HP do personagem para 1 (para não ficar morto na tela)
            // ou redirecione para uma tela de game over. Por enquanto, só seta pra 0.

            await activeCharacter.save(); // Salva o HP atualizado (0)

            return res.json({
                message: "Derrota!",
                battleState: battle,
                character: activeCharacter // Retorna o objeto de personagem atualizado
            });
        }

        // Se a batalha continuar, salva o HP atualizado do personagem
        await activeCharacter.save();
        // Sincroniza o playerHP da sessão com o HP real do personagem
        battle.playerHP = activeCharacter.hp;

        res.json({ message: "Turno concluído.", battleState: battle, character: activeCharacter });

    } catch (error) {
        console.error("Erro durante a batalha:", error);
        res.status(500).json({ success: false, message: "Erro interno durante a batalha." });
    }
});

// Rota para resetar a batalha (voltar para a home sem batalha ativa)
app.post("/battle/reset", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Rota /battle/reset acessada.");
    req.session.battle = null;
    res.json({ message: "Batalha resetada." });
});

// Rota para exibir o inventário
app.get("/inventory/show", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Rota /inventory/show acessada.");
    req.session.inventoryOpen = true;
    req.session.battle = null; // Garante que a batalha não está ativa ao abrir o inventário
    res.redirect("/home");
});

// Rota para esconder o inventário e voltar para a home
app.get("/inventory/hide", isAuthenticatedAndCharacterSelected, (req, res) => {
    console.log("Rota /inventory/hide acessada.");
    req.session.inventoryOpen = null;
    res.redirect("/home");
});

// Rota para atualizar o inventário do usuário no banco de dados (AGORA DO PERSONAGEM)
app.post("/inventory/update", isAuthenticatedAndCharacterSelected, async (req, res) => {
    console.log("Rota /inventory/update acessada.");
    try {
        let { inventory } = req.body;

        if (!Array.isArray(inventory)) {
            console.warn("Received non-array inventory from client. Resetting to empty array.");
            inventory = [];
        }

        const activeCharacter = await Character.findById(req.session.activeCharacterId);
        if (!activeCharacter) {
            return res.status(404).json({ success: false, message: "Personagem não encontrado." });
        }

        // ATENÇÃO: Se seu frontend envia apenas nomes de itens, esta parte precisará ser mais robusta
        // quando você tiver um modelo Item real com IDs. Por agora, apenas atribui.
        activeCharacter.inventory = inventory.map(item => ({ item: item.item, quantity: item.quantity })); // Assume que o cliente envia { item: "nome", quantity: X }

        await activeCharacter.save();

        res.json({ success: true, message: "Inventário atualizado com sucesso!", characterInventory: activeCharacter.inventory });
    } catch (error) {
        console.error("Erro ao atualizar inventário:", error);
        res.status(500).json({ success: false, message: "Erro interno ao atualizar inventário." });
    }
});


// ----------------------------------------------------------------------
// Lógica do Socket.IO (MODIFICADA PARA SALVAR E CARREGAR MENSAGENS)
// ----------------------------------------------------------------------
io.on('connection', async (socket) => {
    console.log('Um usuário conectado ao chat:', socket.id);

    // Carregar histórico de mensagens ao conectar
    try {
        const messages = await ChatMessage.find()
                                        .sort({ timestamp: 1 })
                                        .limit(50);

        messages.forEach(chatMsg => {
            socket.emit('chat message', `${chatMsg.sender}: ${chatMsg.message}`);
        });
        console.log(`Histórico de ${messages.length} mensagens carregado para ${socket.id}`);

    } catch (error) {
        console.error("Erro ao carregar histórico de mensagens:", error);
    }

    // Escuta por mensagens de chat de um cliente
    socket.on('chat message', async (fullMsg) => {
        console.log('Mensagem recebida do cliente:', fullMsg);

        const parts = fullMsg.split(': ');
        let sender = 'Desconhecido';
        let messageContent = fullMsg;

        if (parts.length > 1) {
            sender = parts[0];
            messageContent = parts.slice(1).join(': ');
        }

        try {
            const newChatMessage = new ChatMessage({
                sender: sender,
                message: messageContent
            });
            await newChatMessage.save();
            console.log('Mensagem salva no banco de dados:', newChatMessage);

            io.emit('chat message', fullMsg);

        } catch (error) {
            console.error("Erro ao salvar mensagem no banco de dados:", error);
            socket.emit('chat error', 'Erro ao enviar mensagem.');
        }
    });

    // Quando um cliente se desconecta
    socket.on('disconnect', () => {
        console.log('Um usuário desconectado do chat:', socket.id);
    });
});
// --- Fim da Lógica do Socket.IO ---


// ----------------------------------------------------------------------
// CONFIGURAÇÃO DO SERVIDOR (Listen)
// ----------------------------------------------------------------------

const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});