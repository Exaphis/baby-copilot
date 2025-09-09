// Edit these files to live-reload the diff
type User = { id: number; name: string }
function greet(user: User) {
  const msg = `Hello, ${user.name}!`
  console.log(msg)
  return msg
}

greet({ id: 1, name: "World" })
