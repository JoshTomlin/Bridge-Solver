const fields = {
  south: document.getElementById("south-hand"),
  north: document.getElementById("north-hand"),
  westHcp: document.getElementById("west-hcp"),
  eastShape: document.getElementById("east-shape"),
  notes: document.getElementById("notes"),
  preview: document.getElementById("request-preview"),
  button: document.getElementById("analyze-button")
};

function collectRequest() {
  return {
    declarer: {
      seat: "South",
      hand: fields.south.value.trim()
    },
    dummy: {
      seat: "North",
      hand: fields.north.value.trim()
    },
    restrictions: {
      westHcp: fields.westHcp.value.trim(),
      eastShape: fields.eastShape.value.trim(),
      notes: fields.notes.value.trim()
    }
  };
}

fields.button.addEventListener("click", () => {
  const request = collectRequest();
  fields.preview.textContent = JSON.stringify(request, null, 2);
});
