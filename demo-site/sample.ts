// Edit this file and the page will live-reload.
type User = { id: number; name: string }
function greet(user: User) {
  const msg = `Hello, ${user.name}!`
  console.log(msg)
  return msg
}

greet({ id: 1, name: "Baby Copilot" })
