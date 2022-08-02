let response;
const responseHandler = require("./responseHandler");
const dynamodb = require("aws-sdk/clients/dynamodb");
const { v4: uuidv4 } = require("uuid");
const docClient = new dynamodb.DocumentClient();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.lambdaHandler = async (event, context) => {
	let path = event.path;
	let statusCode = 400;
	let data = "";
	path = path.replace(/([^\/]*\/){2}/, "");
	try {
		switch (event.httpMethod) {
			case "OPTIONS":
				if (
					path === "project" ||
					path === "expense" ||
					path === "register" ||
					path === "login" ||
					path === "verify" ||
					path === "reset" ||
					path === "resetPassword" ||
					path === "getUsers" ||
					path === "approveExpense" ||
					path === "rejectExpense"
				) {
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
				let body = JSON.parse(event.body);
				if (path === "project")
					[data, statusCode] = await createProject(body.project);
				else if (path === "expense")
					[data, statusCode] = await addExpense(body.expense);
				else if (path === "register")
					[data, statusCode] = await registerAccount(body.userInfo);
				else if (path === "login")
					[data, statusCode] = await login(body.userInfo);
				else if (path === "verify") [data, statusCode] = await verify(body);
				else if (path === "reset")
					[data, statusCode] = await resetPasswordFirstTime(body);
				else if (path === "approveExpense")
					[data, statusCode] = await approveExpense(body.id);
				else if (path === "rejectExpense")
					[data, statusCode] = await rejectExpense(body.id, body.reason);
				else if (path === "resetPassword")
					[data, statusCode] = await resetPassword(body.username);
				break;
			case "GET":
				let params = event.queryStringParameters;
				if (path === "project") {
					[data, statusCode] = await getAllProjectDetails();
				} else if (path === "expense") {
					if (params?.status === "pending") {
						[data, statusCode] = await getAllExpenseDetails();
					} else if (params?.status === "approved") {
						[data, statusCode] = await getAllApprovedExpenseDetails();
					} else if (params?.status === "rejected") {
						[data, statusCode] = await getAllRejectedExpenseDetails();
					}
				} else if (path === "getUsers") {
					[data, statusCode] = await getAllUsersDetails();
				}
				break;
			case "DELETE":
				if (path === "project") {
					let body = JSON.parse(event.body);
					[data, statusCode] = await deleteProject(body.id);
				} else if (path === "expense") {
					let body = JSON.parse(event.body);
					[data, statusCode] = await deleteExpense(body.id);
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

async function getAllApprovedExpenseDetails() {
	const data = await docClient
		.scan({ TableName: "approvedExpenseTable" })
		.promise();
	return [data, 200];
}

async function getAllRejectedExpenseDetails() {
	const data = await docClient
		.scan({ TableName: "rejectedExpenseTable" })
		.promise();
	return [data, 200];
}

//Registration
async function registerAccount(userInfo) {
	let { name, username, password, role } = { ...userInfo };

	//Checking all fields
	if (!name || !username || !password || !role)
		return ["Error: All fields are required", 401];

	username = username.toLowerCase().trim();
	role = role.toLowerCase().trim();

	//Checking if user already exist
	const user = await docClient
		.get({
			TableName: "userTable",
			Key: { username },
		})
		.promise();
	if (!isObjectEmpty(user)) return ["Error: Username already exists", 401];

	//Registering user
	const encryptedPassword = bcrypt.hashSync(password.trim(), 10);
	await docClient
		.put({
			TableName: "userTable",
			Item: {
				username,
				name,
				password: encryptedPassword,
				role,
				first_login: true,
			},
		})
		.promise();
	return ["User successfully created", 200];
}

//Logging In
async function login(userInfo) {
	let { username, password } = { ...userInfo };

	//Checking required fields
	if (!username || !password) return ["Error: All fields are required", 401];

	//Checking if user exists and comparing password
	const user = await docClient
		.get({
			TableName: "userTable",
			Key: { username },
		})
		.promise();
	if (isObjectEmpty(user)) return ["Error: No User found", 401];
	else {
		if (!bcrypt.compareSync(password, user.Item.password)) {
			return ["Error: Incorrect password", 403];
		}
		let new_user = {
			username: user.Item.username,
			name: user.Item.name,
			role: user.Item.role,
			first_login: user.Item.first_login,
		};
		const token = generateToken(new_user);
		const responseBody = {
			user: new_user,
			token,
		};
		return [responseBody, 200];
	}
}

async function resetPassword(username) {
	let password = "123456";
	const encryptedPassword = bcrypt.hashSync(password.trim(), 10);

	let item = { password: encryptedPassword, first_login: true };
	await docClient
		.update({
			TableName: "userTable",
			Key: { username },
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
		})
		.promise();
	return ["Password Successfully Reset", 200];
}

async function changePassword({
	old_password,
	new_password,
	confirm_password,
}) {}

//Verifying logged in Acc
function verify({ user, token }) {
	if (!user || !user.username || !user.role || !user.name)
		return [{ verified: false, mssg: "incorrect request body" }, 400];

	verification = jwt.verify(token, "mysecretkey30903xcdfsdfg", (err, res) => {
		if (err) return { verified: false, mssg: "invalid token" };
		if (
			res.username !== user.username ||
			res.role !== user.role ||
			res.name !== user.name
		)
			return { verified: false, mssg: "invalid token" };
		return { verified: true, mssg: "verified" };
	});

	if (!verification.verified) {
		return [verification, 400];
	} else {
		return [verification, 200];
	}
}

async function getAllUsersDetails() {
	const data = await docClient.scan({ TableName: "userTable" }).promise();
	return [data, 200];
}

async function resetPasswordFirstTime(body) {
	let { new_password, confirm_password, user } = { ...body };

	//Checking required fields
	if (!new_password || !confirm_password)
		return ["Error: All fields are required", 401];
	else if (!user) return ["Error: No user", 401];

	if (new_password === confirm_password) {
		let username = user.username;
		const encryptedPassword = bcrypt.hashSync(new_password.trim(), 10);
		if (user.first_login) {
			let item = {
				password: encryptedPassword,
				first_login: false,
			};
			const data = await docClient
				.update({
					TableName: "userTable",
					Key: { username },
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
			return ["Password changed successfully", 200];
		} else {
			return ["Not first time logging in", 400];
		}
	} else {
		return ["Password did not match", 400];
	}
}

async function deleteExpense(id) {
	if (!id) throw new Error("Provide a Primary Key");

	await docClient
		.delete({
			TableName: "expenseTable",
			Key: { id },
		})
		.promise();
	return ["Deleted Expense", 200];
}

async function approveExpense(id) {
	if (!id) throw new Error("Provide a primary Key!");

	let data = await docClient
		.delete({
			TableName: "expenseTable",
			Key: { id },
			ReturnValues: "ALL_OLD",
		})
		.promise();

	let approved_expense = data.Attributes;
	approved_expense["status"] = "approved";

	await docClient
		.put({
			TableName: "approvedExpenseTable",
			Item: approved_expense,
		})
		.promise();

	return ["Approved Expense", 200];
}

async function rejectExpense(id, reason) {
	if (!id) throw new Error("Provide a primary Key!");

	let data = await docClient
		.delete({
			TableName: "expenseTable",
			Key: { id },
			ReturnValues: "ALL_OLD",
		})
		.promise();

	let rejected_expense = data.Attributes;
	rejected_expense["status"] = "rejected";
	rejected_expense["reason"] = reason;

	await docClient
		.put({
			TableName: "rejectedExpenseTable",
			Item: rejected_expense,
		})
		.promise();

	return ["Rejected Expense", 200];
}

//########## HELPER FUNCs #############

function isObjectEmpty(obj) {
	for (const i in obj) return false;
	return true;
}

function generateToken(user) {
	if (!user) return null;
	return jwt.sign(user, "mysecretkey30903xcdfsdfg", {
		expiresIn: "1h",
	});
}
