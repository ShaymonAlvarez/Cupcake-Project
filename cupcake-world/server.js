const fetch = require('node-fetch'); // Ensure node-fetch is installed

const express = require('express');
const bodyParser = require('body-parser');
const Airtable = require('airtable');
const session = require('express-session');
const bcrypt = require('bcrypt'); 
const path = require('path');

const app = express();
const port = 3000;

// Configuration Variables
const AIRTABLE_API_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const AIRTABLE_BASE_ID = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SESSION_SECRET = 'xxxxxxxxxxxx';
const SHOPIFY_STORE_URL = 'xxxxx-xx.myshopify.com/'; 
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SHOPIFY_WEBHOOK_SECRET = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';


// Airtable configuration
// Airtable configuration
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const tableName = 'Usuarios';
const suporteTable = 'Suporte';
// Session configuration
app.use(session({
  secret: SESSION_SECRET, // Replace with a secure secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 3600000 // Session expiration in milliseconds
  }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(__dirname));

// -------------------- Registration Endpoint --------------------
app.post('/register', async (req, res) => {
  const {
    nome,
    email,
    data_nascimento,
    cpf,
    senha,
    telefone,
    confirmar_senha
  } = req.body;

  if (senha !== confirmar_senha) {
    return res.json({ success: false, message: 'As senhas não coincidem.' });
  }

  // Hash the password
  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(senha, 10);
  } catch (err) {
    console.error('Error hashing password:', err);
    return res.json({ success: false, message: 'Erro ao processar a senha.' });
  }

  base(tableName).select({
    filterByFormula: `OR({email} = '${email}', {cpf} = '${cpf}')`
  }).firstPage((err, records) => {
    if (err) {
      console.error('Error fetching records:', err);
      return res.json({ success: false, message: 'Erro ao acessar o banco de dados.' });
    }

    if (records.length > 0) {
      return res.json({ success: false, message: 'Usuário já cadastrado com este e-mail ou CPF.' });
    }

    base(tableName).create([
      {
        fields: {
          nome,
          email,
          data_nascimento,
          cpf,
          senha: hashedPassword, // Store the hashed password
          telefone
        }
      }
    ], (err, records) => {
      if (err) {
        console.error('Error creating record:', err);
        return res.json({ success: false, message: 'Erro ao criar usuário.' });
      }
      res.json({ success: true, message: 'Cadastro realizado com sucesso!' });
    });
  });
});

// -------------------- Login Endpoint (Update) --------------------
app.post('/login', (req, res) => {
  const { email, senha } = req.body;

  base(tableName).select({
    filterByFormula: `{email} = '${email}'`
  }).firstPage(async (err, records) => {
    if (err) {
      console.error('Error fetching records:', err);
      return res.json({ success: false, message: 'Erro ao acessar o banco de dados.' });
    }

    if (records.length === 0) {
      return res.json({ success: false, message: 'E-mail não encontrado.' });
    }

    const user = records[0];
    const storedHashedPassword = user.get('senha');

    try {
      const match = await bcrypt.compare(senha, storedHashedPassword);
      if (!match) {
        return res.json({ success: false, message: 'Senha incorreta.' });
      }
    } catch (err) {
      console.error('Error comparing passwords:', err);
      return res.json({ success: false, message: 'Erro ao verificar a senha.' });
    }

    // Authentication successful, store user ID in session
    req.session.userId = user.getId();
    res.json({ success: true, message: 'Login realizado com sucesso!' });
  });
});
// -------------------- Logout Endpoint --------------------
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logout realizado com sucesso!' });
});

// -------------------- Fetch User Data Endpoint --------------------
app.get('/user-data', (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, message: 'Usuário não autenticado.' });
  }

  base(tableName).find(req.session.userId, (err, record) => {
    if (err) {
      console.error('Error fetching user data:', err);
      return res.json({ success: false, message: 'Erro ao acessar o banco de dados.' });
    }

    const userData = {
      nome: record.get('nome'),
      email: record.get('email'),
      data_nascimento: record.get('data_nascimento'),
      cpf: record.get('cpf'),
      telefone: record.get('telefone'),
      preferencias_notific: record.get('preferencias_notific') || []
    };

    res.json({ success: true, data: userData });
  });
});

// -------------------- Update Preferences Endpoint --------------------
app.post('/update-preferences', (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, message: 'Usuário não autenticado.' });
  }

  const { preferencias_notific } = req.body;

  base(tableName).update([
    {
      id: req.session.userId,
      fields: {
        preferencias_notific
      }
    }
  ], (err, records) => {
    if (err) {
      console.error('Error updating preferences:', err);
      return res.json({ success: false, message: 'Erro ao atualizar preferências.' });
    }
    res.json({ success: true, message: 'Preferências atualizadas com sucesso!' });
  });
});
// -------------------- Update Profile Endpoint --------------------
app.post('/update-profile', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, message: 'Usuário não autenticado.' });
  }

  const { nome, cpf, data_nascimento, telefone, email, senha } = req.body;

  // Optional: Validate input data here

  // Prepare fields to update
  const fieldsToUpdate = {
    nome,
    cpf,
    data_nascimento,
    telefone,
    email
  };

  // Handle password update if provided
  if (senha) {
    try {
      const hashedPassword = await bcrypt.hash(senha, 10); // Hash the new password
      fieldsToUpdate.senha = hashedPassword;
    } catch (err) {
      console.error('Error hashing password:', err);
      return res.json({ success: false, message: 'Erro ao atualizar a senha.' });
    }
  }

  // Update the user's record in Airtable
  base(tableName).update([
    {
      id: req.session.userId,
      fields: fieldsToUpdate
    }
  ], (err, records) => {
    if (err) {
      console.error('Error updating profile:', err);
      return res.json({ success: false, message: 'Erro ao atualizar cadastro.' });
    }
    res.json({ success: true, message: 'Cadastro atualizado com sucesso!' });
  });
});

// -------------------- Support Form Submission Endpoint --------------------
app.post('/suporte', async (req, res) => {
  try {
    const { nome, email, telefone, mensagem, motivo } = req.body;
    console.log('Received support request:', req.body);

    const fields = {
      Mensagem: mensagem,
      Motivo: Array.isArray(motivo) ? motivo : [motivo],
      data_envio: new Date().toISOString(),
      Nome: nome,
      Email: email,
      Telefone: telefone
    };

    if (req.session.userId) {
      // Verify that req.session.userId is valid
      console.log('Session user ID:', req.session.userId);

      // Ensure it's a valid Airtable record ID
      if (!req.session.userId.startsWith('rec')) {
        console.error('Invalid Airtable record ID:', req.session.userId);
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
      }

      fields.id_usuario = [req.session.userId];

      // Retrieve user's information from the Usuarios table
      base(tableName).find(req.session.userId, (err, record) => {
        if (err) {
          console.error('Error fetching user data:', err);
          return res.status(500).json({ success: false, message: 'Erro ao acessar os dados do usuário.', error: err.message });
        }

        fields.Nome = record.get('nome');
        fields.Email = record.get('email');
        fields.Telefone = record.get('telefone');

        // Log the fields being sent to Airtable
        console.log('Creating support record with fields:', fields);

        // Create the support record
        base(suporteTable).create([{ fields }], (err, records) => {
          if (err) {
            console.error('Error creating support record:', err);
            return res.status(500).json({ success: false, message: 'Erro ao enviar a solicitação de suporte.', error: err.message });
          }
          res.json({ success: true, message: 'Sua solicitação de suporte foi enviada com sucesso!' });
        });
      });
    } else {
      // User is not logged in
      if (!nome || !email || !telefone || !mensagem) {
        return res.status(400).json({ success: false, message: 'Por favor, preencha todos os campos obrigatórios.' });
      }

      // Log the fields being sent to Airtable
      console.log('Creating support record with fields:', fields);

      // Create a new record in the 'Suporte' table
      base(suporteTable).create([{ fields }], (err, records) => {
        if (err) {
          console.error('Error creating support record:', err);
          return res.status(500).json({ success: false, message: 'Erro ao enviar a solicitação de suporte.', error: err.message });
        }
        res.json({ success: true, message: 'Sua solicitação de suporte foi enviada com sucesso!' });
      });
    }
  } catch (error) {
    console.error('Unexpected error in /suporte endpoint:', error);
    res.status(500).json({ success: false, message: 'Erro inesperado no servidor.', error: error.message });
  }
});

// Endpoint to create order and get Shopify checkout URL
app.post('/create-order', async (req, res) => {
  try {
    const { cart } = req.body;
    if (!cart || !Array.isArray(cart)) {
      console.error('Dados do carrinho inválidos recebidos:', cart);
      return res.status(400).json({ success: false, message: 'Dados do carrinho inválidos.' });
    }

    // Validar cada item do carrinho
    for (const item of cart) {
      if (!item.variantId || !item.quantidade || !item.preco) {
        console.error('Dados incompletos no item do carrinho:', item);
        return res.status(400).json({ success: false, message: 'Dados incompletos no item do carrinho.' });
      }
    }

    // Converter itens do carrinho para lineItems do Shopify
    const lineItems = [];
    const variantIdToProductId = {}; // Mapa para armazenar variantId -> id_produto

    for (const item of cart) {
      // Buscar o registro do produto no Airtable com base no variantId
      const productRecords = await base('Produtos').select({
        filterByFormula: `{variantId} = '${item.variantId}'`
      }).firstPage();

      if (productRecords.length === 0) {
        console.error(`Nenhum produto encontrado no Airtable para variantId "${item.variantId}"`);
        return res.status(400).json({ success: false, message: `Produto com variantId "${item.variantId}" não encontrado.` });
      }

      const productRecord = productRecords[0];
      const id_produto = productRecord.getId();

      // Armazenar o id_produto para uso posterior
      variantIdToProductId[item.variantId] = id_produto;

      // Adicionar ao array de lineItems do Shopify
      lineItems.push({
        variantId: item.variantId, // ID da variante no Shopify
        quantity: item.quantidade,
        customAttributes: [
          { key: 'Cobertura', value: item.cobertura },
          { key: 'Confeites', value: item.confeite },
        ]
      });
    }

    // Criar checkout usando a API Storefront do Shopify
    const query = `
      mutation checkoutCreate($input: CheckoutCreateInput!) {
        checkoutCreate(input: $input) {
          checkout {
            id
            webUrl
          }
          checkoutUserErrors {
            code
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lineItems
      }
    };

    const shopifyResponse = await fetch(`https://${SHOPIFY_STORE_URL}/api/2023-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables })
    });
    
    const shopifyResult = await shopifyResponse.json();

    if (shopifyResult.errors) {
      console.error('Erros da API do Shopify:', shopifyResult.errors);
      return res.status(500).json({ success: false, message: 'Erro ao criar checkout no Shopify.' });
    }

    const { checkout, checkoutUserErrors } = shopifyResult.data.checkoutCreate;

    if (checkoutUserErrors.length > 0) {
      console.error('Erros de usuário no checkout do Shopify:', checkoutUserErrors);
      return res.status(400).json({ success: false, message: checkoutUserErrors[0].message });
    }

    // Criar registro de Pedido no Airtable
    const userId = req.session.userId;

    if (!userId) {
      console.error('Usuário não autenticado.');
      return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    }

    // Buscar dados do usuário no Airtable
    let userRecord;
    try {
      userRecord = await new Promise((resolve, reject) => {
        base('Usuarios').find(userId, (err, record) => {
          if (err) {
            return reject(err);
          }
          resolve(record);
        });
      });
    } catch (err) {
      console.error('Erro ao buscar dados do usuário:', err);
      return res.status(500).json({ success: false, message: 'Erro ao acessar os dados do usuário.', error: err.message });
    }

    const userEmail = userRecord.get('email');
    const userName = userRecord.get('nome');
    const userTelefone = userRecord.get('telefone');

    const totalPedido = cart.reduce((sum, item) => sum + parseFloat(item.preco) * item.quantidade, 0);

    const orderFields = {
      id_usuario: [userId],
      data_pedido: new Date().toISOString(),
      status: 'Pendente',
      total_pedido: totalPedido.toFixed(2),
      opcao_entrega: 'Padrão', // Pode ser dinâmico se necessário
      codigo_rastreamento: '', // Inicialmente vazio
      checkout_id: checkout.id, // Armazenar o ID do checkout do Shopify
      itens_do_pedido: [] // Será preenchido posteriormente
    };

    let pedidosRecords;
    try {
      pedidosRecords = await new Promise((resolve, reject) => {
        base('Pedidos').create([
          {
            fields: orderFields
          }
        ], (err, records) => {
          if (err) {
            return reject(err);
          }
          resolve(records);
        });
      });
    } catch (err) {
      console.error('Erro ao criar registro de Pedido no Airtable:', err);
      return res.status(500).json({ success: false, message: 'Erro ao criar pedido no banco de dados.' });
    }

    const pedidoRecord = pedidosRecords[0];
    const pedidoId = pedidoRecord.getId();

    // Criar registros de Itens do Pedido no Airtable
    const itensDoPedido = cart.map(item => ({
      fields: {
        id_pedido: [pedidoId],
        id_produto: [variantIdToProductId[item.variantId]], // Usando o id_produto obtido
        quantidade: item.quantidade,
        subtotal: (parseFloat(item.preco) * item.quantidade).toFixed(2),
        customizacao: `Cobertura: ${item.cobertura}, Confeites: ${item.confeite}`
      }
    }));

    let itensPedidoRecords;
    try {
      itensPedidoRecords = await new Promise((resolve, reject) => {
        base('Itens do Pedido').create(itensDoPedido, (err, records) => {
          if (err) {
            return reject(err);
          }
          resolve(records);
        });
      });
    } catch (err) {
      console.error('Erro ao criar registros de Itens do Pedido no Airtable:', err);
      return res.status(500).json({ success: false, message: 'Erro ao criar itens do pedido no banco de dados.' });
    }

    const itemIds = itensPedidoRecords.map(record => record.getId());

    // Atualizar registro de Pedido com os Itens do Pedido vinculados
    try {
      await new Promise((resolve, reject) => {
        base('Pedidos').update([
          {
            id: pedidoId,
            fields: {
              itens_do_pedido: itemIds
            }
          }
        ], (err, records) => {
          if (err) {
            return reject(err);
          }
          resolve(records);
        });
      });
    } catch (err) {
      console.error('Erro ao atualizar registro de Pedido com Itens do Pedido:', err);
      return res.status(500).json({ success: false, message: 'Erro ao atualizar pedido no banco de dados.' });
    }

    // Responder com a URL de checkout do Shopify
    res.json({ success: true, checkoutUrl: checkout.webUrl });

  } catch (error) {
    console.error('Erro inesperado no endpoint /create-order:', error);
    res.status(500).json({ success: false, message: 'Erro inesperado no servidor.', error: error.message });
  }
});

// Endpoint to get user's orders, optionally with search
app.get('/get-orders', async (req, res) => {
  try {
    const userId = req.session.userId;
    console.log('User ID from session:', userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    }

    const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';
    console.log('Search Query:', searchQuery);

    // Obter o nome do usuário
    let userName;
    try {
      const userRecord = await base('Usuarios').find(userId);
      userName = userRecord.get('nome');
      console.log('User Name:', userName);
    } catch (error) {
      console.error('Error fetching user name:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar o nome do usuário.', error: error.message });
    }

    // Buscar 'Pedidos' vinculados ao usuário usando o ID do usuário
    let pedidosRecords;
    try {
      pedidosRecords = await base('Pedidos').select({
        filterByFormula: `FIND('${userId}', {id_usuario}) > 0`,
        sort: [{ field: 'data_pedido', direction: 'desc' }]
      }).all();
      console.log('Pedidos Records:', pedidosRecords);
      console.log('Número de Pedidos encontrados:', pedidosRecords.length);
    } catch (error) {
      console.error('Error fetching Pedidos:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar pedidos.', error: error.message });
    }

    if (pedidosRecords.length === 0) {
      console.log('Nenhum pedido encontrado para o usuário.');
      return res.json({ success: true, orders: [] });
    }

    // Obter os valores do campo primário dos pedidos (ajuste conforme seu campo primário)
    const pedidosPrimaryValues = pedidosRecords.map(record => record.get('id_pedido') || record.getId());
    console.log('Pedidos Primary Values:', pedidosPrimaryValues);

    // Buscar 'Itens do Pedido' para todos os pedidos usando o campo 'id_pedido'
    let itensFormula;
    if (pedidosPrimaryValues.length === 1) {
      itensFormula = `FIND('${pedidosPrimaryValues[0]}', {id_pedido}) > 0`;
    } else {
      const itensConditions = pedidosPrimaryValues.map(value => `FIND('${value}', {id_pedido}) > 0`);
      itensFormula = `OR(${itensConditions.join(', ')})`;
    }
    console.log('Itens Formula:', itensFormula);

    let itensRecords;
    try {
      itensRecords = await base('Itens do Pedido').select({
        filterByFormula: itensFormula
      }).all();
      console.log('Itens do Pedido Records:', itensRecords);
      console.log('Número de Itens do Pedido encontrados:', itensRecords.length);
    } catch (error) {
      console.error('Error fetching Itens do Pedido:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar itens do pedido.', error: error.message });
    }

    // Extrair nomes únicos de produtos
    const uniqueProdutoNames = [...new Set(itensRecords.map(item => {
      const id_produto_arr = item.get('id_produto');
      if (id_produto_arr && id_produto_arr.length > 0) {
        return id_produto_arr[0];
      } else {
        console.error('id_produto is undefined or empty for item:', item.fields);
        return null;
      }
    }).filter(name => name !== null))];
    console.log('Unique Produto Names:', uniqueProdutoNames);

    if (uniqueProdutoNames.length === 0) {
      console.log('Nenhum produto encontrado nos itens do pedido.');
      return res.json({ success: true, orders: [] });
    }

    // Buscar 'Produtos' para todos os nomes únicos de produtos
    let produtosFormula;
    if (uniqueProdutoNames.length === 1) {
      produtosFormula = `FIND('${uniqueProdutoNames[0]}', {nome}) > 0`;
    } else {
      const produtosConditions = uniqueProdutoNames.map(name => `FIND('${name}', {nome}) > 0`);
      produtosFormula = `OR(${produtosConditions.join(', ')})`;
    }
    console.log('Produtos Formula:', produtosFormula);

    let produtosRecords;
    try {
      produtosRecords = await base('Produtos').select({
        filterByFormula: produtosFormula
      }).all();
      console.log('Produtos Records:', produtosRecords);
      console.log('Número de Produtos encontrados:', produtosRecords.length);
    } catch (error) {
      console.error('Error fetching Produtos:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar produtos.', error: error.message });
    }

    // Criar um mapa de nomes de produtos para detalhes
    const produtoNomeToDetalhes = {};
    produtosRecords.forEach(produto => {
      const nomeProduto = produto.get('nome');
      produtoNomeToDetalhes[nomeProduto] = {
        nome: nomeProduto,
        // Adicione outros detalhes do produto se necessário
      };
      console.log(`Produto Nome: ${nomeProduto}`);
    });

    // Construir o array de pedidos
    const orders = pedidosRecords.map(pedidoRecord => {
      const pedidoId = pedidoRecord.get('id_pedido') || pedidoRecord.getId();
      const data_pedido = pedidoRecord.get('data_pedido');
      const total_pedido = pedidoRecord.get('total_pedido');

      // Filtrar itens para este pedido
      const itensDoPedido = itensRecords.filter(item => {
        const id_pedido_arr = item.get('id_pedido');
        if (id_pedido_arr && id_pedido_arr.length > 0) {
          return id_pedido_arr[0] === pedidoId;
        } else {
          console.error('id_pedido is undefined or empty for item:', item.fields);
          return false;
        }
      });
      console.log(`Itens do Pedido para Pedido ID ${pedidoId}:`, itensDoPedido);

      const itensDoPedidoDetalhados = itensDoPedido.map(item => {
        const id_produto_arr = item.get('id_produto');
        if (id_produto_arr && id_produto_arr.length > 0) {
          const nome_produto = id_produto_arr[0];
          return {
            nome_produto: (produtoNomeToDetalhes[nome_produto] && produtoNomeToDetalhes[nome_produto].nome) || 'Produto Desconhecido',
            quantidade: item.get('quantidade'),
            subtotal: item.get('subtotal'),
            customizacao: item.get('customizacao') || ''
          };
        } else {
          console.error('id_produto is undefined or empty for item:', item.fields);
          return null;
        }
      }).filter(item => item !== null && (!searchQuery || item.nome_produto.toLowerCase().includes(searchQuery)));

      // Pular pedido se nenhum item corresponder à busca
      if (searchQuery && itensDoPedidoDetalhados.length === 0) {
        return null;
      }

      return {
        id_pedido: pedidoId,
        data_pedido,
        total_pedido,
        itens_do_pedido: itensDoPedidoDetalhados
      };
    }).filter(order => order !== null);

    console.log('Orders to return:', orders);

    res.json({ success: true, orders });

  } catch (error) {
    console.error('Unexpected error in /get-orders endpoint:', error);
    res.status(500).json({ success: false, message: 'Erro inesperado no servidor.', error: error.message });
  }
});


const crypto = require('crypto');

// Middleware to parse raw body for webhook
// Shopify webhook for order paid with verification
app.post('/webhook/shopify/order-paid', (req, res) => {
  try {
    const webhookSecret = SHOPIFY_WEBHOOK_SECRET; // Use the defined constant

    // Retrieve the HMAC header from Shopify
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');

    // Compute the HMAC digest using the webhook secret and request body
    const hash = crypto.createHmac('sha256', webhookSecret)
                      .update(req.body)
                      .digest('base64');

    if (hash !== hmacHeader) {
      console.error('Webhook HMAC validation failed.');
      return res.status(401).send('Unauthorized');
    }

    // Parse the webhook payload
    const orderData = JSON.parse(req.body.toString());

    // Extract necessary info
    const shopifyOrderId = orderData.id; // Shopify order ID
    const checkoutId = orderData.checkout_id || orderData.checkoutId; // Adjust based on Shopify's payload

    if (!checkoutId) {
      console.error('Checkout ID not found in webhook payload.');
      return res.status(400).send();
    }

    // Find the 'Pedido' in Airtable based on checkout_id
    base('Pedidos').select({
      filterByFormula: `{checkout_id} = '${checkoutId}'`
    }).firstPage((err, records) => {
      if (err) {
        console.error('Error fetching Pedido by Shopify checkout ID:', err);
        return res.status(500).send();
      }

      if (records.length === 0) {
        console.error('No Pedido found for Shopify checkout ID:', checkoutId);
        return res.status(200).send(); // Acknowledge the webhook
      }

      const pedidoRecord = records[0];
      const pedidoId = pedidoRecord.getId();

      // Update the 'Pedido' status to 'Concluído' and store Shopify order ID
      base('Pedidos').update([
        {
          id: pedidoId,
          fields: {
            status: 'Concluído',
            shopify_order_id: shopifyOrderId,
            codigo_rastreamento: orderData.tracking_number || '' // If available
          }
        }
      ], (err, records) => {
        if (err) {
          console.error('Error updating Pedido status:', err);
          return res.status(500).send();
        }

        console.log('Pedido status updated to Concluído for Shopify order ID:', shopifyOrderId);
        res.status(200).send();
      });
    });

  } catch (error) {
    console.error('Error processing Shopify webhook:', error);
    res.status(500).send();
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;