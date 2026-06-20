const {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  WebhookClient,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const webhooksPath = path.join(__dirname, "../webhooks.json");
const cargarConfig = () => JSON.parse(fs.readFileSync(webhooksPath, "utf8"));
const guardarConfig = (data) =>
  fs.writeFileSync(webhooksPath, JSON.stringify(data, null, 2));

const LISTAS = ["pointercrate", "achievements", "aredl", "hardests"];
const COLORES = {
  pointercrate: 0xe74c3c,
  achievements: 0xf1c40f,
  aredl: 0x3498db,
  hardests: 0x9b59b6,
};

const embedsEnEdicion = new Map();

const buildBotonesEdicion = (disabled = false) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("lista_titulo")
      .setLabel("Título")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_descripcion")
      .setLabel("Descripción")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_color")
      .setLabel("Color")
      .setEmoji("🎨")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_imagen")
      .setLabel("Imagen")
      .setEmoji("🖼️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_footer")
      .setLabel("Footer")
      .setEmoji("🔖")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

const buildBotonesFields = (disabled = false) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("lista_addfield")
      .setLabel("+ Field")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_editfield")
      .setLabel("Editar Field")
      .setEmoji("🔧")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_removefield")
      .setLabel("- Field")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_publicar")
      .setLabel("Publicar")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("lista_cancelar")
      .setLabel("Cancelar")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

const buildPreview = (embedData, lista) => {
  const e = new EmbedBuilder();
  e.setTitle(
    embedData.title ||
      `Lista ${lista.charAt(0).toUpperCase() + lista.slice(1)}`,
  );
  if (embedData.description) e.setDescription(embedData.description);
  else e.setDescription("*(sin descripción)*");
  e.setColor(embedData.color || COLORES[lista]);
  if (embedData.image?.url) e.setImage(embedData.image.url);
  if (embedData.footer?.text) e.setFooter({ text: embedData.footer.text });
  if (embedData.fields?.length) e.addFields(embedData.fields);
  return e;
};

const buildInfoEmbed = (lista, campos) =>
  new EmbedBuilder()
    .setDescription(
      `**Editando lista: \`${lista}\`** — ${campos || 0} fields\nUsá los botones para modificar. 🚀 Publicar cuando termines.`,
    )
    .setColor(0x5865f2);

// Handler de modals — se registra UNA SOLA VEZ en index.js via este export
const handleModal = async (i, embedsEnEdicion) => {
  if (!i.isModalSubmit()) return false;

  const estado = embedsEnEdicion.get(i.user.id);
  if (!estado) return false;

  const modalesConocidos = [
    "modal_titulo",
    "modal_descripcion",
    "modal_color",
    "modal_imagen",
    "modal_footer",
    "modal_addfield",
    "modal_editfield",
    "modal_removefield",
  ];
  if (!modalesConocidos.includes(i.customId)) return false;

  try {
    if (i.customId === "modal_titulo") {
      estado.embedData.title =
        i.fields.getTextInputValue("input_titulo") || undefined;
    } else if (i.customId === "modal_descripcion") {
      estado.embedData.description =
        i.fields.getTextInputValue("input_descripcion") || undefined;
    } else if (i.customId === "modal_color") {
      const hex = i.fields.getTextInputValue("input_color").replace("#", "");
      const parsed = parseInt(hex, 16);
      if (!isNaN(parsed)) estado.embedData.color = parsed;
    } else if (i.customId === "modal_imagen") {
      const url = i.fields.getTextInputValue("input_imagen").trim();
      estado.embedData.image = url ? { url } : null;
    } else if (i.customId === "modal_footer") {
      const texto = i.fields.getTextInputValue("input_footer").trim();
      estado.embedData.footer = texto ? { text: texto } : null;
    } else if (i.customId === "modal_addfield") {
      const nombre = i.fields.getTextInputValue("input_field_nombre");
      const valor = i.fields.getTextInputValue("input_field_valor");
      const inline =
        i.fields.getTextInputValue("input_field_inline").toLowerCase() === "si";
      if (!estado.embedData.fields) estado.embedData.fields = [];
      if (estado.embedData.fields.length >= 25)
        return i.reply({
          content: "❌ Máximo 25 fields por embed.",
          ephemeral: true,
        });
      estado.embedData.fields.push({ name: nombre, value: valor, inline });
    } else if (i.customId === "modal_editfield") {
      const idx = parseInt(i.fields.getTextInputValue("input_field_index")) - 1;
      if (
        isNaN(idx) ||
        idx < 0 ||
        idx >= (estado.embedData.fields?.length || 0)
      )
        return i.reply({
          content: "❌ Número de field inválido.",
          ephemeral: true,
        });
      estado.embedData.fields[idx] = {
        name: i.fields.getTextInputValue("input_field_nombre"),
        value: i.fields.getTextInputValue("input_field_valor"),
        inline:
          i.fields.getTextInputValue("input_field_inline").toLowerCase() ===
          "si",
      };
    } else if (i.customId === "modal_removefield") {
      const idx = parseInt(i.fields.getTextInputValue("input_field_index")) - 1;
      if (
        isNaN(idx) ||
        idx < 0 ||
        idx >= (estado.embedData.fields?.length || 0)
      )
        return i.reply({
          content: "❌ Número de field inválido.",
          ephemeral: true,
        });
      estado.embedData.fields.splice(idx, 1);
    }

    embedsEnEdicion.set(i.user.id, estado);

    const preview = buildPreview(estado.embedData, estado.lista);
    const infoEmbed = buildInfoEmbed(
      estado.lista,
      estado.embedData.fields?.length,
    );

    await i.update({
      embeds: [infoEmbed, preview],
      components: [buildBotonesEdicion(), buildBotonesFields()],
    });
  } catch (err) {
    console.error("Error en modal lista:", err);
    try {
      await i.reply({
        content: "❌ Ocurrió un error procesando el modal.",
        ephemeral: true,
      });
    } catch {}
  }

  return true;
};

module.exports = {
  name: "lista",
  help: {
    purpose: "Administra listas por webhook con embeds editables.",
    category: "🛡️ Moderación",
    adminOnly: true,
  },
  handleModal,
  embedsEnEdicion,

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("❌ No tenés permisos para usar este comando.");

    const config = cargarConfig();

    // -lista setup <lista> <webhookUrl> <channelId>
    if (args[0] === "setup") {
      const lista = args[1]?.toLowerCase();
      const webhookUrl = args[2];
      const channelId = args[3];

      if (!lista || !LISTAS.includes(lista) || !webhookUrl || !channelId)
        return message.reply(
          `❌ Uso: \`-lista setup <${LISTAS.join("|")}> <webhookUrl> <channelId>\``,
        );

      config[lista].webhookUrl = webhookUrl;
      config[lista].channelId = channelId;
      guardarConfig(config);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Webhook configurado")
            .addFields(
              { name: "Lista", value: lista, inline: true },
              { name: "Canal", value: `<#${channelId}>`, inline: true },
            )
            .setColor(0x2ecc71)
            .setTimestamp(),
        ],
      });
    }
    // -lista msg <lista> <messageId>
    if (args[0] === "msg") {
      const lista = args[1]?.toLowerCase();
      const messageId = args[2];

      if (!lista || !LISTAS.includes(lista) || !messageId)
        return message.reply(
          `❌ Uso: \`-lista msg <${LISTAS.join("|")}> <messageId>\``,
        );

      if (config[lista].messageId === messageId) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚠️ Sin cambios")
              .setDescription(
                `La lista \`${lista}\` ya tiene ese message ID guardado.`,
              )
              .addFields({ name: "Message ID actual", value: messageId })
              .setColor(0xf1c40f)
              .setTimestamp(),
          ],
        });
      }

      config[lista].messageId = messageId;
      guardarConfig(config);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Message ID actualizado")
            .addFields(
              { name: "Lista", value: lista, inline: true },
              { name: "Message ID", value: messageId, inline: true },
            )
            .setColor(0x2ecc71)
            .setTimestamp(),
        ],
      });
    }
    // -lista edit <lista>
    if (args[0] === "edit" || !args[0]) {
      const lista = args[1]?.toLowerCase();

      if (!lista || !LISTAS.includes(lista)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📖 Uso: -lista")
              .addFields(
                {
                  name: "Setup webhook",
                  value: "`-lista setup <lista> <webhookUrl> <channelId>`",
                },
                { name: "Editar lista", value: "`-lista edit <lista>`" },
                {
                  name: "Actualizar message ID",
                  value: "`-lista msg <lista> <messageId>`",
                },
                {
                  name: "Listas disponibles",
                  value: LISTAS.map((l) => `\`${l}\``).join(", "),
                },
              )
              .setColor(0x5865f2)
              .setFooter({ text: "gduruguay bot" }),
          ],
        });
      }

      if (!config[lista].webhookUrl)
        return message.reply(
          `❌ La lista \`${lista}\` no tiene webhook configurado. Usá \`-lista setup ${lista} <webhookUrl> <channelId>\``,
        );

      if (embedsEnEdicion.has(message.author.id)) {
        const { lista: listaActual } = embedsEnEdicion.get(message.author.id);
        return message.reply(
          `❌ Ya estás editando \`${listaActual}\`. Terminá o cancelá esa edición primero.`,
        );
      }

      // Cargar embed existente si hay messageId
      let embedData = {
        title: `Lista ${lista.charAt(0).toUpperCase() + lista.slice(1)}`,
        description: "*(sin descripción)*",
        color: COLORES[lista],
        fields: [],
      };

      if (config[lista].messageId && config[lista].channelId) {
        try {
          const canal = await message.guild.channels.fetch(
            config[lista].channelId,
          );
          const msgExistente = await canal.messages.fetch(
            config[lista].messageId,
          );
          if (msgExistente.embeds[0]) {
            const e = msgExistente.embeds[0];
            embedData = {
              title:
                e.title ||
                `Lista ${lista.charAt(0).toUpperCase() + lista.slice(1)}`,
              description: e.description || "*(sin descripción)*",
              color: e.color || COLORES[lista],
              image: e.image ? { url: e.image.url } : null,
              footer: e.footer ? { text: e.footer.text } : null,
              fields:
                e.fields?.map((f) => ({
                  name: f.name,
                  value: f.value,
                  inline: f.inline,
                })) || [],
            };
          }
        } catch {
          // Si falla cargamos embed vacío
        }
      }

      embedsEnEdicion.set(message.author.id, { lista, embedData });

      const preview = buildPreview(embedData, lista);
      const infoEmbed = buildInfoEmbed(lista, embedData.fields?.length);

      const msg = await message.reply({
        embeds: [infoEmbed, preview],
        components: [buildBotonesEdicion(), buildBotonesFields()],
      });

      const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === message.author.id,
        time: 300_000,
      });

      collector.on("collect", async (i) => {
        const estado = embedsEnEdicion.get(i.user.id);
        if (!estado) return;

        // Botones que abren modal
        const modalesMap = {
          lista_titulo: [
            "modal_titulo",
            "Editar título",
            [
              {
                id: "input_titulo",
                label: "Título",
                style: TextInputStyle.Short,
                value: () => estado.embedData.title || "",
                required: false,
              },
            ],
          ],
          lista_descripcion: [
            "modal_descripcion",
            "Editar descripción",
            [
              {
                id: "input_descripcion",
                label: "Descripción",
                style: TextInputStyle.Paragraph,
                value: () => estado.embedData.description || "",
                required: false,
                max: 4000,
              },
            ],
          ],
          lista_color: [
            "modal_color",
            "Editar color",
            [
              {
                id: "input_color",
                label: "Color en HEX (ej: #FF0000)",
                style: TextInputStyle.Short,
                value: () =>
                  "#" +
                  (estado.embedData.color?.toString(16).padStart(6, "0") ||
                    "ffffff"),
                required: false,
              },
            ],
          ],
          lista_imagen: [
            "modal_imagen",
            "Editar imagen",
            [
              {
                id: "input_imagen",
                label: "URL de la imagen (vacío para quitar)",
                style: TextInputStyle.Short,
                value: () => estado.embedData.image?.url || "",
                required: false,
              },
            ],
          ],
          lista_footer: [
            "modal_footer",
            "Editar footer",
            [
              {
                id: "input_footer",
                label: "Texto del footer (vacío para quitar)",
                style: TextInputStyle.Short,
                value: () => estado.embedData.footer?.text || "",
                required: false,
              },
            ],
          ],
          lista_addfield: [
            "modal_addfield",
            "Agregar field",
            [
              {
                id: "input_field_nombre",
                label: "Nombre del field",
                style: TextInputStyle.Short,
                value: () => "",
                required: true,
                max: 256,
              },
              {
                id: "input_field_valor",
                label: "Valor del field",
                style: TextInputStyle.Paragraph,
                value: () => "",
                required: true,
                max: 1024,
              },
              {
                id: "input_field_inline",
                label: "¿Inline? (si/no)",
                style: TextInputStyle.Short,
                value: () => "no",
                required: false,
              },
            ],
          ],
        };

        if (i.customId === "lista_editfield") {
          if (!estado.embedData.fields?.length)
            return i.reply({
              content: "❌ No hay fields para editar.",
              ephemeral: true,
            });

          const modal = new ModalBuilder()
            .setCustomId("modal_editfield")
            .setTitle("Editar field");
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input_field_index")
                .setLabel(
                  `Número de field (1 al ${estado.embedData.fields.length})`,
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input_field_nombre")
                .setLabel("Nuevo nombre")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(256),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input_field_valor")
                .setLabel("Nuevo valor")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1024),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input_field_inline")
                .setLabel("¿Inline? (si/no)")
                .setStyle(TextInputStyle.Short)
                .setValue("no")
                .setRequired(false),
            ),
          );
          return i.showModal(modal);
        }

        if (i.customId === "lista_removefield") {
          if (!estado.embedData.fields?.length)
            return i.reply({
              content: "❌ No hay fields para eliminar.",
              ephemeral: true,
            });

          const modal = new ModalBuilder()
            .setCustomId("modal_removefield")
            .setTitle("Eliminar field");
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input_field_index")
                .setLabel(
                  `Número de field a eliminar (1 al ${estado.embedData.fields.length})`,
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
          return i.showModal(modal);
        }

        if (modalesMap[i.customId]) {
          const [customId, title, inputs] = modalesMap[i.customId];
          const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle(title);
          modal.addComponents(
            ...inputs.map((inp) => {
              const input = new TextInputBuilder()
                .setCustomId(inp.id)
                .setLabel(inp.label)
                .setStyle(inp.style)
                .setValue(inp.value())
                .setRequired(inp.required ?? true);
              if (inp.max) input.setMaxLength(inp.max);
              return new ActionRowBuilder().addComponents(input);
            }),
          );
          return i.showModal(modal);
        }

        // Publicar
        if (i.customId === "lista_publicar") {
          await i.deferUpdate();
          try {
            const embedFinal = buildPreview(estado.embedData, estado.lista);
            const cfg = cargarConfig();
            const { webhookUrl, messageId } = cfg[estado.lista];
            const webhook = new WebhookClient({ url: webhookUrl });

            let nuevoMessageId;
            if (messageId) {
              try {
                await webhook.editMessage(messageId, { embeds: [embedFinal] });
                nuevoMessageId = messageId;
              } catch {
                const sent = await webhook.send({ embeds: [embedFinal] });
                nuevoMessageId = sent.id;
              }
            } else {
              const sent = await webhook.send({ embeds: [embedFinal] });
              nuevoMessageId = sent.id;
            }

            cfg[estado.lista].messageId = nuevoMessageId;
            guardarConfig(cfg);
            embedsEnEdicion.delete(i.user.id);
            collector.stop("publicado");

            await msg.edit({
              embeds: [
                new EmbedBuilder()
                  .setTitle("✅ Lista publicada")
                  .setDescription(
                    `La lista \`${estado.lista}\` fue publicada correctamente en <#${cfg[estado.lista].channelId}>.`,
                  )
                  .setColor(0x2ecc71)
                  .setTimestamp(),
              ],
              components: [],
            });
          } catch (err) {
            console.error(err);
            await msg
              .edit({ content: `❌ Error al publicar: ${err.message}` })
              .catch(() => {});
          }
          return;
        }

        // Cancelar
        if (i.customId === "lista_cancelar") {
          embedsEnEdicion.delete(i.user.id);
          collector.stop("cancelado");
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("❌ Edición cancelada")
                .setColor(0xe74c3c),
            ],
            components: [],
          });
        }
      });

      collector.on("end", async (_, reason) => {
        if (reason !== "publicado" && reason !== "cancelado") {
          embedsEnEdicion.delete(message.author.id);
          await msg
            .edit({
              embeds: [
                new EmbedBuilder()
                  .setTitle("⏰ Sesión expirada")
                  .setDescription(
                    "La sesión de edición expiró por inactividad (5 min).",
                  )
                  .setColor(0x888780),
              ],
              components: [],
            })
            .catch(() => {});
        }
      });

      return;
    }

    message.reply("❌ Subcomando inválido. Usá `-lista` para ver la ayuda.");
  },
};
