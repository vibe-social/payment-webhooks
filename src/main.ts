import { config } from "dotenv"
config()

import Stripe from "stripe"
import express from "express"
import client from "./supabase/client.js"

const app = express()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" })

app.use("/webhook", express.raw({ type: "application/json" }))
app.use(express.json())

async function get_account(customerId: string) {
	const { data, error } = await client.from("clients").select("user_id").eq("stripe_customer_id", customerId).single()
	if (error) {
		console.error(error)
		return null
	}
	return data?.user_id
}

app.post("/webhook", async (req, res) => {
	console.log("Received webhook")
	const sig: string = req.headers["stripe-signature"] as string

	let event

	try {
		event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
	} catch (err) {
		console.error(err)
		res.status(400).json({ message: "Validation failed" })
		return
	}

	if (event.type.startsWith("customer.subscription.")) {
		const session = event.data.object as Stripe.Subscription
		const subscriptionItem = session.items.data[0]
		if (typeof subscriptionItem.price.product != "string") {
			console.error("Invalid subscription item price product")
			res.status(400).json({ message: "Validation failed" })
			return
		}

		const customerId = typeof session.customer === "string" ? session.customer : session.customer.id
		const userId = await get_account(customerId)
		if (!userId) {
			console.error("Invalid account")
			res.status(400).json({ message: "Account not found" })
			return
		}

		if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
			const price = subscriptionItem.price.id
			console.log(`Updating account ${userId} with ${price} subscription metadata`)

			await client
				.from("subscriptions")
				.update({
					plan_id: price,
					subscription_id: session.id,
				})
				.eq("user_id", userId)

		} else if (event.type === "customer.subscription.pending_update_applied") {
			console.log(`Subscription entered pending state for ${userId}`)

		} else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.pending_update_expired") {
			const price = subscriptionItem.price.id
			console.log(`Removing ${price} subscription metadata from account ${userId}`)

			await client
				.from("subscriptions")
				.delete()
				.eq("user_id", userId)

			if (typeof session.latest_invoice !== "string") {
				console.error("Invalid latest invoice")
				res.status(400).json({ message: "Invalid invoice" })
				return
			}

			const invoice = await stripe.invoices.retrieve(session.latest_invoice)
			if (invoice.status === "open") {
				console.log(`Voiding invoice ${session.latest_invoice}`)
				await stripe.invoices.voidInvoice(session.latest_invoice)
			}

		} else {
			console.error("Unknown event type: " + event.type)
			res.status(400).json({ message: "unknown event type" })
			return
		}

	}
})

app.get("/health", (req, res) => {
	res.status(200).json({ status: "ok" })
})

const port = parseInt(process.env.PORT ?? "") || 8080
const server = app.listen(port, () => {
	console.log("Listening on port", port)
})

const shutdown = () => {
	server.close(() => {
		console.log("Shutting down")
		process.exit(0)
	})
}

process.on("SIGTERM", () => {
	shutdown()
})

