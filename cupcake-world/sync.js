// sync.js

const AIRTABLE_API_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const AIRTABLE_BASE_ID = 'xxxxxxxxxxxxx';
const SHOPIFY_STORE_URL = 'xxxxx-xx.myshopify.com'; // Sem barra no final
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const fetch = require('node-fetch'); // node-fetch v2
const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

/**
 * Busca todos os produtos do Shopify usando paginação.
 * @returns {Promise<Array>} Array de todos os nós de produtos.
 */
async function fetchAllProducts() {
  const shopifyStoreURL = SHOPIFY_STORE_URL;
  const storefrontAccessToken = SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  let hasNextPage = true;
  let afterCursor = null;
  const allProducts = [];

  while (hasNextPage) {
    // Construir a consulta GraphQL com paginação
    const query = `
      query ($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    price {
                      amount
                      currencyCode
                    }
                    availableForSale
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              images(first: 1) {
                edges {
                  node {
                    src
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = {
      first: 100, // Número de produtos por requisição
      after: afterCursor, // Cursor de paginação
    };

    try {
      const response = await fetch(`https://${shopifyStoreURL}/api/2023-07/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resposta de rede não foi ok: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      if (result.errors) {
        console.error('Erros da API do Shopify:', result.errors);
        break; // Sair do loop em caso de erro
      }

      const products = result.data.products.edges;
      allProducts.push(...products);

      const pageInfo = result.data.products.pageInfo;
      hasNextPage = pageInfo.hasNextPage;
      afterCursor = pageInfo.endCursor;

      console.log(`Buscou ${products.length} produtos. Total buscados até agora: ${allProducts.length}`);
    } catch (error) {
      console.error('Erro ao buscar produtos do Shopify:', error);
      break; // Sair do loop em caso de erro
    }
  }

  return allProducts;
}

/**
 * Sincroniza produtos e suas variantes do Shopify para o Airtable e gera variantsMapping.json.
 */
async function syncShopifyProductsWithAirtable() {
  try {
    const allProducts = await fetchAllProducts();
    const variantsMapping = {};

    const recordsToCreate = []; // Para criação em lotes

    for (const productEdge of allProducts) {
      const product = productEdge.node;
      const productName = product.title;
      const productDescription = product.title; // Ajuste se tiver uma descrição separada
      const productImage = product.images.edges.length > 0 ? product.images.edges[0].node.src : '';

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const variantId = variant.id; // ID da variante no Shopify
        const variantPrice = parseFloat(variant.price.amount); // Acessar o campo 'amount'
        const availability = variant.availableForSale ? 'Disponível' : 'Indisponível';

        // Extrair opções selecionadas
        let cobertura = '';
        let confeite = '';

        // Log para depuração das opções
        console.log(`Processando Variant ID: ${variantId}`);
        console.log('Opções Selecionadas:', variant.selectedOptions);

        variant.selectedOptions.forEach(option => {
          // Normalizar o nome da opção: remover dois-pontos, converter para minúsculas e remover espaços
          const optionName = option.name.toLowerCase().replace(/:/g, '').trim();

          if (optionName === 'cobertura' || optionName === 'coberturas') {
            cobertura = option.value;
          } else if (optionName === 'confetes' || optionName === 'confeites') {
            confeite = option.value;
          }
        });

        // Validar se ambas as opções estão presentes
        if (!cobertura || !confeite) {
          console.warn(`Variant ID "${variantId}" está faltando cobertura ou confeite. Pulando.`);
          continue;
        }

        // Criar uma chave baseada no nome do produto, cobertura e confeite
        const key = `${productName}|${cobertura}|${confeite}`;

        // Mapear a chave para variantId
        variantsMapping[key] = variantId;

        // Verificar se a variante já existe no Airtable
        const existingRecords = await base('Produtos').select({
          filterByFormula: `{variantId} = '${variantId}'`
        }).firstPage();

        if (existingRecords.length === 0) {
          // Variante não existe, preparar para criação
          recordsToCreate.push({
            fields: {
              nome: productName,
              descricao: productDescription,
              preco: variantPrice,
              disponibilidade: availability, // Campo Single Select
              imagem: productImage ? [{ url: productImage }] : [],
              variantId: variantId,
              cobertura: cobertura,
              confeite: confeite
            }
          });

          // Criar em lotes de 10 registros
          if (recordsToCreate.length === 10) {
            try {
              console.log(`Criando lote de ${recordsToCreate.length} registros de Produto.`);
              await base('Produtos').create(recordsToCreate);
              console.log(`Lote de ${recordsToCreate.length} produtos sincronizados com sucesso.`);
              recordsToCreate.length = 0; // Limpar o array
            } catch (err) {
              console.error('Erro ao criar lote de registros de Produto:', err);
            }
          }
        } else {
          console.log(`Produto com Variant ID "${variantId}" já existe no Airtable.`);
          // Opcional: Atualizar registros existentes, se necessário
          /*
          try {
            await base('Produtos').update(existingRecords[0].id, {
              nome: productName,
              descricao: productDescription,
              preco: variantPrice,
              disponibilidade: availability,
              imagem: productImage ? [{ url: productImage }] : [],
              // variantId permanece o mesmo
              cobertura: cobertura,
              confeite: confeite
            });
            console.log(`Produto "${productName}" com Variant ID "${variantId}" atualizado com sucesso.`);
          } catch (err) {
            console.error(`Erro ao atualizar o registro de Produto para Variant ID "${variantId}":`, err);
          }
          */
        }
      }
    }

    // Criar quaisquer registros restantes que não completaram um lote de 10
    if (recordsToCreate.length > 0) {
      try {
        console.log(`Criando lote final de ${recordsToCreate.length} registros de Produto.`);
        await base('Produtos').create(recordsToCreate);
        console.log(`Lote final de ${recordsToCreate.length} produtos sincronizados com sucesso.`);
      } catch (err) {
        console.error('Erro ao criar lote final de registros de Produto:', err);
      }
    }

    // Agora, buscar todos os registros existentes no Airtable para gerar o variantsMapping.json
    console.log('Buscando todos os registros do Airtable para gerar variantsMapping.json...');
    const airtableRecords = await base('Produtos').select({
      view: 'Grid view' // Substitua pelo nome da view que deseja usar, se diferente
    }).all();

    const finalVariantsMapping = {};

    airtableRecords.forEach(record => {
      const productName = record.get('nome') || '';
      const cobertura = record.get('cobertura') || '';
      const confeite = record.get('confeite') || '';
      const variantId = record.get('variantId') || '';

      if (productName && cobertura && confeite && variantId) {
        const key = `${productName}|${cobertura}|${confeite}`;
        finalVariantsMapping[key] = variantId;
      } else {
        console.warn(`Registro com ID "${record.id}" está faltando nome do produto, cobertura, confeite ou variantId.`);
      }
    });

    // Salvar o mapeamento em um arquivo JSON
    const mappingPath = path.join(__dirname, 'variantsMapping.json');
    fs.writeFileSync(mappingPath, JSON.stringify(finalVariantsMapping, null, 2));
    console.log('Variants mapping salvo em variantsMapping.json');

    console.log('Produtos do Shopify sincronizados com sucesso no Airtable e variantsMapping.json gerado.');
  } catch (error) {
    console.error('Erro ao sincronizar produtos do Shopify com o Airtable:', error);
  }
}

// Executar a sincronização
syncShopifyProductsWithAirtable();
