import OBR from "https://owlbear.rodeo/sdk";

const ID = "com.tutorial.initiative-tracker";

export function setupInitiativeList(element) {
    const renderList = (items) => {
        const initiativeItems = [];
        for (const item of items) {
            const metadata = item.metadata[`${ID}/metadata`];
            if (metadata) {
                initiativeItems.push({
                    initiative: metadata.initiative,
                    name: item.name || "Unbenannt",
                });
            }
        }

        const sortedItems = initiativeItems.sort(
            (a, b) => parseFloat(b.initiative) - parseFloat(a.initiative)
        );

        const nodes = [];
        for (const initiativeItem of sortedItems) {
            const node = document.createElement("li");
            node.innerHTML = `<strong>${initiativeItem.name}</strong> (${initiativeItem.initiative})`;
            nodes.push(node);
        }
        element.replaceChildren(...nodes);
    };

    OBR.scene.items.getItems().then(renderList);
    OBR.scene.items.onChange(renderList);
}
