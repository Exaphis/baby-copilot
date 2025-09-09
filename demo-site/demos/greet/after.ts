// Edit these files to live-reload the diff
type User = { id: number; name: string; email?: string }
function greet(user: User) {
  const msg = `Hello, ${user.name}!`
  console.log(msg.toUpperCase())
  return msg
}

greet({ id: 1, name: "Baby Copilot" })
