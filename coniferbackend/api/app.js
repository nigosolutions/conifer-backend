let response;
const responseHandler = require("./responseHandler");
const dynamodb = require("aws-sdk/clients/dynamodb");
const { v4: uuidv4 } = require('uuid');
const docClient = new dynamodb.DocumentClient();

exports.lambdaHandler = async (event, context) => {
    let path = event.path;
    let statusCode = 400;
    let data = "";
	path = path.replace(/([^\/]*\/){2}/, "");

    try {
        switch (event.httpMethod) {
            case "PUT":
                if (path === "Project"){
                    let body = JSON.parse(event.body);
                    [data, statusCode] = await createProject(body.project);
                }
                break;
        }
        response = responseHandler(data,statusCode);
    } catch (err) {
        console.log(err);
        return err;
    }

    return response;
};

async function createProject(project) {
    let {name, number, contact, location, type} = {...project};
    console.log(project);
    await docClient.put({
    TableName: 'projectTable',
    Item: {
        id: uuidv4(),
        name,
        number,
        contact,
        location,
        type
    }
    }).promise();

    return ["Project Successfully created", 200];
}
