let response;
const responseHandler = require("./responseHandler");
const dynamodb = require("aws-sdk/clients/dynamodb");
const { v4: uuidv4 } = require("uuid");
const docClient = new dynamodb.DocumentClient();

exports.lambdaHandler = async (event, context) => {
	let path = event.path;
	let statusCode = 400;
	let data = "";
	path = path.replace(/([^\/]*\/){2}/, "");

	try {
		switch (event.httpMethod) {
			case "OPTIONS":
				if (path === "project" || path === "expense") {
					[data, statusCode] = ["Success", 200];
				} else {
					[data, statusCode] = ["Error: Invalid Request", 400];
				}
				break;
			case "PUT":
				if (path === "project") {
					let body = JSON.parse(event.body);
					[data, statusCode] = await updateProject(body.id, body.item);
				}
				break;
			case "POST":
				if (path === "project") {
					let body = JSON.parse(event.body);
					[data, statusCode] = await createProject(body.project);
				} else if (path === "expense") {
					let body = JSON.parse(event.body);
					[data, statusCode] = await addExpense(body.expense);
				}
				break;
			case "GET":
				if (path === "project") {
					[data, statusCode] = await getAllProjectDetails();
				} else if (path === "expense") {
					[data, statusCode] = await getAllExpenseDetails();
				}
				break;
			case "DELETE":
				if (path === "project") {
					let body = JSON.parse(event.body);
					[data, statusCode] = await deleteProject(body.id);
				}
				break;
		}
		response = responseHandler(data, statusCode);
	} catch (err) {
		statusCode = 400;
		response = responseHandler(err.message, statusCode);
	}

	return response;
};

async function createProject(project) {
	let { name, number, contact, location, type } = { ...project };
	console.log("hello");
	await docClient
		.put({
			TableName: "projectTable",
			Item: {
				id: uuidv4(),
				name,
				number,
				contact,
				location,
				type,
			},
		})
		.promise();

	return ["Project Successfully created", 200];
}

async function getAllProjectDetails() {
	const data = await docClient.scan({ TableName: "projectTable" }).promise();
	return [data, 200];
}

async function updateProject(id, item) {
	if (!id) throw new Error("Provide a Primary Key");
	const data = await docClient
		.update({
			TableName: "projectTable",
			Key: { id },
			UpdateExpression:
				"set " +
				Object.keys(item)
					.map((k) => `#${k} = :${k}`)
					.join(", "),
			ExpressionAttributeNames: Object.entries(item).reduce(
				(acc, cur) => ({ ...acc, [`#${cur[0]}`]: cur[0] }),
				{}
			),
			ExpressionAttributeValues: Object.entries(item).reduce(
				(acc, cur) => ({ ...acc, [`:${cur[0]}`]: cur[1] }),
				{}
			),
			ReturnValues: "ALL_NEW",
		})
		.promise();
	return [data, 200];
}

async function deleteProject(id) {
	if (!id) throw new Error("Provide a Primary Key");

	await docClient
		.delete({
			TableName: "projectTable",
			Key: { id },
		})
		.promise();
	return ["Deleted Project", 200];
}

async function addExpense(expense) {
	await docClient
		.put({
			TableName: "expenseTable",
			Item: {
				id: uuidv4(),
				...expense,
			},
		})
		.promise();

	return ["Expense Successfully added", 200];
}

async function getAllExpenseDetails() {
	const data = await docClient.scan({ TableName: "expenseTable" }).promise();
	return [data, 200];
}
