import OBR from "https://owlbear.rodeo/sdk";

const ID = "com.tutorial.initiative-tracker";

// Wir nutzen auch hier wieder die absoluten Links (Brechstange!)
const ADD_ICON = "https://cvierer.github.io/dsa-owlbear/add.svg";
const REMOVE_ICON = "https://cvierer.github.io/dsa-owlbear/remove.svg";

export function setupContextMenu() {
    OBR.contextMenu.create({
        id: `${ID}/context-menu`,
        icons: [
            {
                icon: ADD_ICON,
                label: "Zur Initiative hinzufügen",
                filter: {
                    every: [
                        // Wir haben den Layer-Filter entfernt, der Button taucht jetzt ÜBERALL auf!
                        { key: ["metadata", `${ID}/metadata`], value: undefined }
                    ]
                }
            },
            {
                icon: REMOVE_ICON,
                label: "Von Initiative entfernen",
                filter: {
                    every: [] 
                }
            }
        ],
        onClick(context) {
            const addToInitiative = context.items.every(
                (item) => item.metadata[`${ID}/metadata`] === undefined
            );

            if (addToInitiative) {
                const initiative = window.prompt("Initiative eingeben:");
                if (initiative === null) return;
                
                OBR.scene.items.updateItems(context.items, (items) => {
                    for (let item of items) {
                        item.metadata[`${ID}/metadata`] = {
                            initiative: parseInt(initiative) || 0
                        };
                    }
                });
            } else {
                OBR.scene.items.updateItems(context.items, (items) => {
                    for (let item of items) {
                        delete item.metadata[`${ID}/metadata`];
                    }
                });
            }
        }
    });
}
