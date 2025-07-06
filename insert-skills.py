import pymongo
from pymongo import MongoClient
from bson.objectid import ObjectId

# --- CONFIGURAÇÃO DO BANCO DE DADOS ---
# Substitua 'SEU_MONGODB_URI_AQUI' pela sua URI real do MongoDB
MONGODB_URI = 'mongodb+srv://oncodyuser:gCLNx5rSSIXifYiE@rpguser-cluster.y0kadgf.mongodb.net/RPGUSER-CLUSTER?retryWrites=true&w=majority&appName=RPGUSER-CLUSTER' 
DB_NAME = MONGODB_URI.split('/')[-1].split('?')[0] # Extrai o nome do DB da URI

try:
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    skills_collection = db['skills'] # Nome da coleção de habilidades
    print(f"Conectado ao banco de dados: {DB_NAME}")
except Exception as e:
    print(f"Erro ao conectar ao MongoDB: {e}")
    exit()

# --- DEFINIÇÃO DAS HABILIDADES ---
# Cada habilidade é um dicionário que corresponde ao schema Skill.js
skills_data = [
    # Habilidades Neutras (Atacar e Defender) - Para todas as classes
    {
        "name": "Atacar",
        "description": "Um ataque físico básico.",
        "requiredLevel": 1,
        "class": ["Lutador", "Atirador", "Espadachim"],
        "effect": {"type": "damage", "value": 10, "target": "enemy", "message": "Você desferiu um ataque básico!"},
        "cooldown": 0,
        "type": "active_attack"
    },
    {
        "name": "Defender",
        "description": "Aumenta sua defesa por um turno.",
        "requiredLevel": 1,
        "class": ["Lutador", "Atirador", "Espadachim"],
        "effect": {"type": "buff", "stat": "defense", "value": 0.50, "duration": 1, "target": "self", "message": "Você se preparou para defender!"},
        "cooldown": 0,
        "type": "active_defense"
    },

    # Habilidades do Lutador
    {
        "name": "Sequência de Soco",
        "description": "Uma sequência rápida de socos que causa dano moderado.",
        "requiredLevel": 5,
        "class": ["Lutador"],
        "effect": {"type": "damage", "value": 25, "target": "enemy", "message": "Você desferiu uma sequência rápida de socos!"},
        "cooldown": 2,
        "type": "active_attack"
    },
    {
        "name": "Força Brutal",
        "description": "Aumenta seu poder de ataque em 10% por 3 turnos.",
        "requiredLevel": 5,
        "class": ["Lutador"],
        "effect": {"type": "buff", "stat": "attack", "value": 0.10, "duration": 3, "target": "self", "message": "Sua força bruta aumenta por 3 turnos!"},
        "cooldown": 4,
        "type": "buff_self"
    },
    {
        "name": "Soco Energético",
        "description": "Canaliza energia para um soco poderoso, causando dano significativo.",
        "requiredLevel": 10,
        "class": ["Lutador"],
        "effect": {"type": "damage", "value": 40, "target": "enemy", "message": "Você canalizou energia para um soco poderoso!"},
        "cooldown": 3,
        "type": "active_attack"
    },
    {
        "name": "Chute Rotatório",
        "description": "Um chute giratório devastador que atinge o inimigo.",
        "requiredLevel": 20,
        "class": ["Lutador"],
        "effect": {"type": "damage", "value": 60, "target": "enemy", "message": "Você girou e desferiu um chute devastador!"},
        "cooldown": 4,
        "type": "active_attack"
    },
    {
        "name": "Soco Relâmpago",
        "description": "Um soco rápido como um relâmpago, com alta precisão.",
        "requiredLevel": 30,
        "class": ["Lutador"],
        "effect": {"type": "damage", "value": 80, "target": "enemy", "message": "Um soco rápido como um relâmpago atinge o inimigo!"},
        "cooldown": 5,
        "type": "active_attack"
    },
    {
        "name": "Chute Estelar",
        "description": "Um chute com a força de uma estrela cadente, causando dano massivo.",
        "requiredLevel": 45,
        "class": ["Lutador"],
        "effect": {"type": "damage", "value": 120, "target": "enemy", "message": "Você desferiu um chute com a força de uma estrela cadente!"},
        "cooldown": 7,
        "type": "active_attack"
    },
    {
        "name": "Rasteira de Diamante",
        "description": "Uma rasteira implacável que quebra as defesas do inimigo.",
        "requiredLevel": 50,
        "class": ["Lutador"],
        "effect": {"type": "damage", "value": 150, "target": "enemy", "message": "Uma rasteira implacável quebra as defesas do inimigo!"},
        "cooldown": 8,
        "type": "active_attack"
    },

    # Habilidades do Atirador
    {
        "name": "Tiro Flamejante",
        "description": "Um tiro imbuído de fogo que causa dano e incendeia o inimigo.",
        "requiredLevel": 5,
        "class": ["Atirador"],
        "effect": {"type": "damage", "value": 25, "target": "enemy", "message": "Um tiro flamejante atinge o inimigo!"},
        "cooldown": 2,
        "type": "active_attack"
    },
    {
        "name": "Escudo de Fumaça",
        "description": "Cria uma cortina de fumaça que aumenta sua defesa em 20% por 2 turnos.",
        "requiredLevel": 5,
        "class": ["Atirador"],
        "effect": {"type": "buff", "stat": "defense", "value": 0.20, "duration": 2, "target": "self", "message": "Você ergueu uma cortina de fumaça, aumentando sua defesa!"},
        "cooldown": 4,
        "type": "buff_self"
    },
    {
        "name": "Tiro Duplo",
        "description": "Dispara dois tiros rápidos no alvo.",
        "requiredLevel": 10,
        "class": ["Atirador"],
        "effect": {"type": "damage", "value": 40, "target": "enemy", "message": "Dois tiros rápidos atingem o alvo!"},
        "cooldown": 3,
        "type": "active_attack"
    },
    {
        "name": "Sequência de Tiros",
        "description": "Descarrega uma rajada de tiros no inimigo.",
        "requiredLevel": 20,
        "class": ["Atirador"],
        "effect": {"type": "damage", "value": 60, "target": "enemy", "message": "Você descarregou uma rajada de tiros!"},
        "cooldown": 4,
        "type": "active_attack"
    },
    {
        "name": "Tiro Estelar",
        "description": "Um tiro brilhante e preciso que acerta o inimigo com grande força.",
        "requiredLevel": 30,
        "class": ["Atirador"],
        "effect": {"type": "damage", "value": 80, "target": "enemy", "message": "Um tiro brilhante e preciso acerta o inimigo!"},
        "cooldown": 5,
        "type": "active_attack"
    },
    {
        "name": "Rajada Dupla",
        "description": "Dispara duas rajadas poderosas de uma vez.",
        "requiredLevel": 45,
        "class": ["Atirador"],
        "effect": {"type": "damage", "value": 120, "target": "enemy", "message": "Você disparou duas rajadas poderosas de uma vez!"},
        "cooldown": 7,
        "type": "active_attack"
    },
    {
        "name": "Tiro Certeiro",
        "description": "Um tiro fatal que não pode ser evitado, com alta chance de acerto crítico.",
        "requiredLevel": 50,
        "class": ["Atirador"],
        "effect": {"type": "damage", "value": 150, "target": "enemy", "message": "Um tiro fatal que não pode ser evitado!"},
        "cooldown": 8,
        "type": "active_attack"
    },

    # Habilidades do Espadachim
    {
        "name": "Corte Afiado",
        "description": "Um corte rápido e afiado que causa dano moderado.",
        "requiredLevel": 5,
        "class": ["Espadachim"],
        "effect": {"type": "damage", "value": 25, "target": "enemy", "message": "Um corte rápido e afiado atinge o inimigo!"},
        "cooldown": 2,
        "type": "active_attack"
    },
    {
        "name": "Agilidade Felina",
        "description": "Aumenta sua agilidade em 10% por 3 turnos, tornando-o mais difícil de acertar.",
        "requiredLevel": 5,
        "class": ["Espadachim"],
        "effect": {"type": "buff", "stat": "agility", "value": 0.10, "duration": 3, "target": "self", "message": "Sua agilidade aumenta, tornando-o mais difícil de acertar!"},
        "cooldown": 4,
        "type": "buff_self"
    },
    {
        "name": "Corte Duplo",
        "description": "Desfere dois cortes rápidos no alvo.",
        "requiredLevel": 10,
        "class": ["Espadachim"],
        "effect": {"type": "damage", "value": 40, "target": "enemy", "message": "Você desferiu dois cortes rápidos!"},
        "cooldown": 3,
        "type": "active_attack"
    },
    {
        "name": "Sequência de Cortes",
        "description": "Uma série de cortes rápidos e precisos que causam dano contínuo.",
        "requiredLevel": 20,
        "class": ["Espadachim"],
        "effect": {"type": "damage", "value": 60, "target": "enemy", "message": "Uma série de cortes rápidos e precisos!"},
        "cooldown": 4,
        "type": "active_attack"
    },
    {
        "name": "Corte Duplo Estelar",
        "description": "Dois cortes poderosos, como estrelas cadentes, com grande impacto.",
        "requiredLevel": 30,
        "class": ["Espadachim"],
        "effect": {"type": "damage", "value": 80, "target": "enemy", "message": "Dois cortes poderosos, como estrelas cadentes!"},
        "cooldown": 5,
        "type": "active_attack"
    },
    {
        "name": "Espada Flamejante",
        "description": "Sua espada se incendeia, aumentando seu dano de ataque em 15% por 3 turnos.",
        "requiredLevel": 45,
        "class": ["Espadachim"],
        "effect": {"type": "buff", "stat": "attack", "value": 0.15, "duration": 3, "target": "self", "message": "Sua espada se incendeia, aumentando seu dano!"},
        "cooldown": 7,
        "type": "buff_self"
    },
    {
        "name": "Corte Mortífero",
        "description": "Um corte final e devastador que sela o destino do inimigo.",
        "requiredLevel": 50,
        "class": ["Espadachim"],
        "effect": {"type": "damage", "value": 150, "target": "enemy", "message": "Um corte final e devastador que sela o destino do inimigo!"},
        "cooldown": 8,
        "type": "active_attack"
    }
]

# --- INSERIR HABILIDADES NO BANCO DE DADOS ---
for skill_data in skills_data:
    try:
        # Tenta encontrar uma habilidade existente pelo nome
        existing_skill = skills_collection.find_one({"name": skill_data["name"]})
        if existing_skill:
            print(f"Habilidade '{skill_data['name']}' já existe. Pulando inserção.")
        else:
            # Insere a nova habilidade
            result = skills_collection.insert_one(skill_data)
            print(f"Habilidade '{skill_data['name']}' inserida com ID: {result.inserted_id}")
    except Exception as e:
        print(f"Erro ao inserir habilidade '{skill_data['name']}': {e}")

print("\nProcesso de inserção de habilidades concluído.")
client.close()
