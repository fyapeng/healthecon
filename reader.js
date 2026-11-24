const params = new URLSearchParams(location.hash.slice(1));
document.querySelector("#msg").textContent = [
  params.get("title"),
  params.get("id"),
]
  .filter(Boolean)
  .join(" · ");
const files = document.querySelector("#files"),
  docs = document.querySelector("#docs"),
  frame = document.querySelector("iframe");
let url = "";
function show() {
  if (url) URL.revokeObjectURL(url);
  const file = files.files[Number(docs.value)];
  frame.hidden = !file;
  if (file) {
    url = URL.createObjectURL(file);
    frame.src = url;
  } else {
    frame.removeAttribute("src");
    url = "";
  }
}
files.onchange = () => {
  docs.replaceChildren(
    ...Array.from(files.files, (f, i) => new Option(f.name, i)),
  );
  docs.hidden = !docs.length;
  show();
};
docs.onchange = show;
window.addEventListener("pagehide", () => {
  if (url) URL.revokeObjectURL(url);
});
